/**
 * Sandbox Execution Engine v1.0
 *
 * Provides persistent, isolated command execution environments for users.
 * Each sandbox is a virtual workspace with:
 * - Persistent file system (backed by S3)
 * - Command execution with timeout and output capture
 * - Working directory tracking
 * - Environment variable management
 * - Command history logging
 *
 * Architecture:
 * - Commands execute via child_process.spawn in isolated temp directories
 * - Workspace state is persisted to S3 as tarballs between sessions
 * - Each user can have multiple named sandboxes
 * - The AI assistant can execute commands via the sandbox_exec tool
 */

import { exec, execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "./db";
import {
  sandboxes,
  sandboxCommands,
  sandboxFiles,
  type Sandbox,
  type InsertSandbox,
} from "../drizzle/schema";
import { storagePut } from "./storage";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
import {
  validateFilePath,
  checkUserRateLimit,
  logSecurityEvent,
} from "./security-hardening";
const log = createLogger("SandboxEngine");

const execAsync = promisify(exec);

// ─── Constants ───────────────────────────────────────────────────────

const SANDBOX_BASE_DIR = path.join(os.tmpdir(), "titan-sandboxes");
const MAX_OUTPUT_SIZE = 100 * 1024; // 100KB max output per command
const DEFAULT_TIMEOUT_MS = 60_000; // 60 seconds default
const MAX_TIMEOUT_MS = 300_000; // 5 minutes max

// Blocked commands that could damage the host system
const BLOCKED_COMMANDS = [
  /^\s*rm\s+-rf\s+\/\s*$/,     // rm -rf /
  /^\s*mkfs\./,                  // format disk
  /^\s*dd\s+.*of=\/dev\//,      // write to raw device
  /^\s*shutdown/,                // shutdown host
  /^\s*reboot/,                  // reboot host
  /^\s*halt/,                    // halt host
  /:\(\)\s*\{\s*:\|:\s*&\s*\}/, // fork bomb
];

// ─── Sandbox Manager ─────────────────────────────────────────────────

/**
 * Ensure the sandbox base directory exists
 */
function ensureSandboxBaseDir(): void {
  if (!fs.existsSync(SANDBOX_BASE_DIR)) {
    fs.mkdirSync(SANDBOX_BASE_DIR, { recursive: true });
  }
}

/**
 * Get the local workspace path for a sandbox
 */
function getWorkspacePath(sandboxId: number): string {
  return path.join(SANDBOX_BASE_DIR, `sandbox-${sandboxId}`);
}

/**
 * Create a new sandbox for a user
 */
export async function createSandbox(
  userId: number,
  name: string,
  options?: { memoryMb?: number; diskMb?: number; timeoutSeconds?: number }
): Promise<Sandbox> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .insert(sandboxes)
    .values({
      userId,
      name,
      osType: "linux",
      status: "creating",
      memoryMb: options?.memoryMb ?? 512,
      diskMb: options?.diskMb ?? 2048,
      timeoutSeconds: options?.timeoutSeconds ?? 300,
      installedPackages: [],
      envVars: {},
    })
    .$returningId();

  // Create local workspace directory
  ensureSandboxBaseDir();
  const workspacePath = getWorkspacePath(row.id);
  fs.mkdirSync(workspacePath, { recursive: true });

  // Create a basic workspace structure
  const homeDir = path.join(workspacePath, "home", "sandbox");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.writeFileSync(
    path.join(homeDir, "README.md"),
    `# Sandbox: ${name}\n\nYour persistent workspace. Files here are saved between sessions.\n`
  );

  // Mark as running
  await db
    .update(sandboxes)
    .set({
      status: "running",
      workingDirectory: "/home/sandbox",
      lastActiveAt: new Date(),
    })
    .where(eq(sandboxes.id, row.id));

  const [sandbox] = await db
    .select()
    .from(sandboxes)
    .where(eq(sandboxes.id, row.id))
    .limit(1);

  return sandbox;
}

/**
 * Get a sandbox by ID, verifying ownership
 */
export async function getSandbox(
  sandboxId: number,
  userId: number
): Promise<Sandbox | null> {
  const db = await getDb();
  if (!db) return null;

  const [sandbox] = await db
    .select()
    .from(sandboxes)
    .where(and(eq(sandboxes.id, sandboxId), eq(sandboxes.userId, userId)))
    .limit(1);

  return sandbox || null;
}

/**
 * List all sandboxes for a user
 */
export async function listSandboxes(userId: number): Promise<Sandbox[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(sandboxes)
    .where(eq(sandboxes.userId, userId))
    .orderBy(desc(sandboxes.lastActiveAt));
}

/**
 * Delete a sandbox and clean up its workspace
 */
export async function deleteSandbox(
  sandboxId: number,
  userId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const sandbox = await getSandbox(sandboxId, userId);
  if (!sandbox) return false;

  // Clean up local workspace
  const workspacePath = getWorkspacePath(sandboxId);
  if (fs.existsSync(workspacePath)) {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }

  // Delete from database (commands and files cascade)
  await db.delete(sandboxCommands).where(eq(sandboxCommands.sandboxId, sandboxId));
  await db.delete(sandboxFiles).where(eq(sandboxFiles.sandboxId, sandboxId));
  await db.delete(sandboxes).where(eq(sandboxes.id, sandboxId));

  return true;
}

// ─── Command Execution ───────────────────────────────────────────────

/**
 * Check if a command is blocked
 */
function isBlockedCommand(command: string): string | null {
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(command)) {
      return `Command blocked for safety: matches pattern ${pattern.source}`;
    }
  }
  return null;
}

/**
 * Execute a command in a sandbox environment
 */
export async function executeCommand(
  sandboxId: number,
  userId: number,
  command: string,
  options?: {
    timeoutMs?: number;
    triggeredBy?: "user" | "ai" | "system";
    workingDirectory?: string;
  }
): Promise<{
  output: string;
  exitCode: number;
  durationMs: number;
  workingDirectory: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const sandbox = await getSandbox(sandboxId, userId);
  if (!sandbox) throw new Error("Sandbox not found");

  // ── SECURITY: Per-User Sandbox Rate Limiting ──────────────────
  const rateCheck = await checkUserRateLimit(userId, "sandbox:exec");
  if (!rateCheck.allowed) {
    return {
      output: `Error: Sandbox rate limit exceeded. Please wait ${Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)}s.`,
      exitCode: 1,
      durationMs: 0,
      workingDirectory: sandbox.workingDirectory,
    };
  }

  // Check for blocked commands
  const blocked = isBlockedCommand(command);
  if (blocked) {
    await logSecurityEvent(userId, "sandbox_blocked_command", {
      command: command.substring(0, 200),
      sandboxId,
    });
    return {
      output: `Error: ${blocked}`,
      exitCode: 1,
      durationMs: 0,
      workingDirectory: sandbox.workingDirectory,
    };
  }

  // Ensure workspace exists
  ensureSandboxBaseDir();
  const workspacePath = getWorkspacePath(sandboxId);
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
    const homeDir = path.join(workspacePath, "home", "sandbox");
    fs.mkdirSync(homeDir, { recursive: true });
  }

  // Determine working directory
  const requestedCwd = options?.workingDirectory || sandbox.workingDirectory;
  // Map the virtual path to the real path
  const realCwd = path.join(workspacePath, requestedCwd.replace(/^\//, ""));
  if (!fs.existsSync(realCwd)) {
    fs.mkdirSync(realCwd, { recursive: true });
  }

  const timeoutMs = Math.min(
    options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS
  );

  const startTime = Date.now();
  let output = "";
  let exitCode = 0;
  let newWorkingDirectory = requestedCwd;

  try {
    // Handle cd commands specially to track working directory
    const cdMatch = command.match(/^\s*cd\s+(.+)\s*$/);
    if (cdMatch) {
      const targetDir = cdMatch[1].replace(/^~/, "/home/sandbox");
      const resolvedPath = path.isAbsolute(targetDir)
        ? targetDir
        : path.resolve(requestedCwd, targetDir);
      const realTarget = path.join(workspacePath, resolvedPath.replace(/^\//, ""));

      if (fs.existsSync(realTarget) && fs.statSync(realTarget).isDirectory()) {
        newWorkingDirectory = resolvedPath;
        output = "";
        exitCode = 0;
      } else {
        output = `bash: cd: ${targetDir}: No such file or directory\n`;
        exitCode = 1;
      }
    } else {
      // Execute the command
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
        (resolve) => {
          const env: Record<string, string> = {
            HOME: path.join(workspacePath, "home", "sandbox"),
            USER: "sandbox",
            PATH: `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${path.join(workspacePath, "home", "sandbox", ".local", "bin")}`,
            ...(sandbox.envVars || {}),
          };

          execFile(
            "bash",
            ["-c", command],
            {
              cwd: realCwd,
              env,
              timeout: timeoutMs,
              maxBuffer: MAX_OUTPUT_SIZE,
            },
            (error, stdout, stderr) => {
              if (error && "killed" in error && error.killed) {
                resolve({
                  stdout: stdout || "",
                  stderr: `Command timed out after ${timeoutMs}ms\n`,
                  exitCode: 124,
                });
              } else {
                resolve({
                  stdout: stdout || "",
                  stderr: stderr || "",
                  exitCode: error ? (error as any).code ?? 1 : 0,
                });
              }
            }
          );
        }
      );

      output = result.stdout + (result.stderr ? result.stderr : "");
      exitCode = result.exitCode;

      // Truncate output if too large
      if (output.length > MAX_OUTPUT_SIZE) {
        output =
          output.slice(0, MAX_OUTPUT_SIZE) +
          "\n... [output truncated at 100KB]";
      }
    }
  } catch (err: unknown) {
    output = `Error executing command: ${getErrorMessage(err)}\n`;
    exitCode = 1;
  }

  const durationMs = Date.now() - startTime;

  // Log the command
  await db.insert(sandboxCommands).values({
    sandboxId,
    userId,
    command,
    output: output || null,
    exitCode,
    workingDirectory: newWorkingDirectory,
    durationMs,
    triggeredBy: options?.triggeredBy ?? "user",
  });

  // Update sandbox state
  await db
    .update(sandboxes)
    .set({
      workingDirectory: newWorkingDirectory,
      lastActiveAt: new Date(),
      totalCommands: (sandbox.totalCommands || 0) + 1,
    })
    .where(eq(sandboxes.id, sandboxId));

  return {
    output,
    exitCode,
    durationMs,
    workingDirectory: newWorkingDirectory,
  };
}

/**
 * Get command history for a sandbox
 */
export async function getCommandHistory(
  sandboxId: number,
  userId: number,
  limit: number = 50
): Promise<Array<{
  id: number;
  command: string;
  output: string | null;
  exitCode: number | null;
  workingDirectory: string | null;
  durationMs: number | null;
  triggeredBy: string;
  createdAt: Date;
}>> {
  const db = await getDb();
  if (!db) return [];

  const sandbox = await getSandbox(sandboxId, userId);
  if (!sandbox) return [];

  return db
    .select()
    .from(sandboxCommands)
    .where(eq(sandboxCommands.sandboxId, sandboxId))
    .orderBy(desc(sandboxCommands.createdAt))
    .limit(limit);
}

/**
 * List files in a sandbox directory
 */
export async function listFiles(
  sandboxId: number,
  userId: number,
  dirPath: string = "/home/sandbox"
): Promise<Array<{
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}>> {
  const sandbox = await getSandbox(sandboxId, userId);
  if (!sandbox) return [];

  const workspacePath = getWorkspacePath(sandboxId);
  const realPath = path.join(workspacePath, dirPath.replace(/^\//, ""));

  if (!fs.existsSync(realPath)) return [];

  const entries = fs.readdirSync(realPath, { withFileTypes: true });
  return entries.map((entry) => {
    const fullPath = path.join(realPath, entry.name);
    const stat = fs.statSync(fullPath);
    return {
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
      size: stat.size,
    };
  });
}

/**
 * Read a file from the sandbox
 */
export async function readFile(
  sandboxId: number,
  userId: number,
  filePath: string
): Promise<string | null> {
  const sandbox = await getSandbox(sandboxId, userId);
  if (!sandbox) return null;

  const workspacePath = getWorkspacePath(sandboxId);
  const realPath = path.join(workspacePath, filePath.replace(/^\//, ""));

  if (!fs.existsSync(realPath)) return null;

  const stat = fs.statSync(realPath);
  if (stat.size > 1024 * 1024) {
    return "[File too large to display — over 1MB]";
  }

  return fs.readFileSync(realPath, "utf-8");
}

/**
 * Write a file to the sandbox
 */
export async function writeFile(
  sandboxId: number,
  userId: number,
  filePath: string,
  content: string
): Promise<boolean> {
  const sandbox = await getSandbox(sandboxId, userId);
  if (!sandbox) return false;

  const workspacePath = getWorkspacePath(sandboxId);
  const realPath = path.join(workspacePath, filePath.replace(/^\//, ""));

  // Ensure parent directory exists
  const parentDir = path.dirname(realPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  fs.writeFileSync(realPath, content, "utf-8");
  return true;
}

/**
 * Save sandbox workspace to S3 for persistence
 */
export async function persistWorkspace(
  sandboxId: number,
  userId: number
): Promise<string | null> {
  const sandbox = await getSandbox(sandboxId, userId);
  if (!sandbox) return null;

  const workspacePath = getWorkspacePath(sandboxId);
  if (!fs.existsSync(workspacePath)) return null;

  try {
    // Create tarball of workspace
    const tarPath = path.join(os.tmpdir(), `sandbox-${sandboxId}-${Date.now()}.tar.gz`);
    await execAsync(`tar -czf "${tarPath}" -C "${workspacePath}" .`);

    // Upload to S3
    const tarBuffer = fs.readFileSync(tarPath);
    const s3Key = `sandboxes/${userId}/sandbox-${sandboxId}/workspace.tar.gz`;
    const { url } = await storagePut(s3Key, tarBuffer, "application/gzip");

    // Update sandbox record
    const db = await getDb();
    if (db) {
      await db
        .update(sandboxes)
        .set({ workspaceKey: s3Key })
        .where(eq(sandboxes.id, sandboxId));
    }

    // Clean up temp tar
    fs.unlinkSync(tarPath);

    return url;
  } catch (err: unknown) {
    log.error(`[Sandbox] Failed to persist workspace ${sandboxId}:`, { error: String(getErrorMessage(err)) });
    return null;
  }
}

/**
 * Update environment variables for a sandbox
 */
export async function updateEnvVars(
  sandboxId: number,
  userId: number,
  envVars: Record<string, string>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const sandbox = await getSandbox(sandboxId, userId);
  if (!sandbox) return false;

  const merged = { ...(sandbox.envVars || {}), ...envVars };

  await db
    .update(sandboxes)
    .set({ envVars: merged })
    .where(eq(sandboxes.id, sandboxId));

  return true;
}

/**
 * Install a package in the sandbox (tracks installed packages)
 */
export async function installPackage(
  sandboxId: number,
  userId: number,
  packageManager: "apt" | "pip" | "npm",
  packageName: string
): Promise<{ success: boolean; output: string }> {
  const commands: Record<string, string> = {
    apt: `sudo apt-get install -y ${packageName}`,
    pip: `pip3 install ${packageName}`,
    npm: `npm install -g ${packageName}`,
  };

  const command = commands[packageManager];
  if (!command) {
    return { success: false, output: `Unknown package manager: ${packageManager}` };
  }

  const result = await executeCommand(sandboxId, userId, command, {
    triggeredBy: "system",
    timeoutMs: 120_000, // 2 minutes for installs
  });

  if (result.exitCode === 0) {
    // Track installed package
    const db = await getDb();
    if (db) {
      const sandbox = await getSandbox(sandboxId, userId);
      if (sandbox) {
        const packages = [...(sandbox.installedPackages || []), `${packageManager}:${packageName}`];
        await db
          .update(sandboxes)
          .set({ installedPackages: packages })
          .where(eq(sandboxes.id, sandboxId));
      }
    }
  }

  return { success: result.exitCode === 0, output: result.output };
}

/**
 * Restore a sandbox workspace from S3 (reverse of persistWorkspace).
 * Downloads the tarball and extracts it into the sandbox's local directory.
 */
export async function restoreWorkspace(
  sandboxId: number,
  userId: number
): Promise<boolean> {
  const sandbox = await getSandbox(sandboxId, userId);
  if (!sandbox || !sandbox.workspaceKey) return false;

  const workspacePath = getWorkspacePath(sandboxId);
  ensureSandboxBaseDir();

  try {
    // Get the download URL from S3
    const { storageGet } = await import("./storage");
    const { url } = await storageGet(sandbox.workspaceKey);

    // Download the tarball
    const tarPath = path.join(os.tmpdir(), `sandbox-restore-${sandboxId}-${Date.now()}.tar.gz`);
    const resp = await fetch(url);
    if (!resp.ok) {
      log.error(`[Sandbox] Failed to download workspace tarball for sandbox ${sandboxId}: ${resp.statusText}`);
      return false;
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(tarPath, buffer);

    // Ensure workspace directory exists and is clean
    if (fs.existsSync(workspacePath)) {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
    fs.mkdirSync(workspacePath, { recursive: true });

    // Extract tarball
    await execAsync(`tar -xzf "${tarPath}" -C "${workspacePath}"`);

    // Clean up temp tar
    fs.unlinkSync(tarPath);

    log.info(`[Sandbox] Restored workspace for sandbox ${sandboxId} from S3`);
    return true;
  } catch (err: unknown) {
    log.error(`[Sandbox] Failed to restore workspace ${sandboxId}:`, { error: String(getErrorMessage(err)) });
    return false;
  }
}

/**
 * Delete a file or directory from the sandbox filesystem.
 */
export async function deleteFile(
  sandboxId: number,
  userId: number,
  filePath: string
): Promise<boolean> {
  const sandbox = await getSandbox(sandboxId, userId);
  if (!sandbox) return false;

  const workspacePath = getWorkspacePath(sandboxId);
  const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
  const fullPath = path.join(workspacePath, normalizedPath);

  // Security: prevent path traversal
  if (!fullPath.startsWith(workspacePath)) {
    log.warn(`[Sandbox] Path traversal attempt blocked: ${filePath}`);
    return false;
  }

  try {
    if (!fs.existsSync(fullPath)) {
      return false;
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }

    // Also remove from sandboxFiles table if tracked
    const db = await getDb();
    if (db) {
      await db
        .delete(sandboxFiles)
        .where(
          and(
            eq(sandboxFiles.sandboxId, sandboxId),
            eq(sandboxFiles.filePath, normalizedPath)
          )
        );
    }

    return true;
  } catch (err: unknown) {
    log.error(`[Sandbox] Failed to delete file ${filePath} in sandbox ${sandboxId}:`, { error: String(getErrorMessage(err)) });
    return false;
  }
}

/**
 * Write binary content to a file in the sandbox (for images, archives, etc.).
 * Uses a temp file + mv approach to avoid shell command length limits with base64.
 */
export async function writeBinaryFile(
  sandboxId: number,
  userId: number,
  filePath: string,
  buffer: Buffer
): Promise<boolean> {
  const sandbox = await getSandbox(sandboxId, userId);
  if (!sandbox) return false;

  const workspacePath = getWorkspacePath(sandboxId);
  const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
  const fullPath = path.join(workspacePath, normalizedPath);

  // Security: prevent path traversal
  if (!fullPath.startsWith(workspacePath)) {
    log.warn(`[Sandbox] Path traversal attempt blocked: ${filePath}`);
    return false;
  }

  try {
    // Ensure directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write directly to the filesystem — no shell command length limits
    fs.writeFileSync(fullPath, buffer);

    // Track in sandboxFiles table
    const db = await getDb();
    if (db) {
      await db.insert(sandboxFiles).values({
        sandboxId,
        filePath: normalizedPath,
        fileSize: buffer.length,
        isDirectory: 0,
      }).onDuplicateKeyUpdate({
        set: { fileSize: buffer.length },
      });
    }

    return true;
  } catch (err: unknown) {
    log.error(`[Sandbox] Failed to write binary file ${filePath} in sandbox ${sandboxId}:`, { error: String(getErrorMessage(err)) });
    return false;
  }
}
