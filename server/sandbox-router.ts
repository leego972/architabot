/**
 * Sandbox Router — tRPC endpoints for sandbox management and command execution
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import {
  createSandbox,
  getSandbox,
  listSandboxes,
  deleteSandbox,
  executeCommand,
  getCommandHistory,
  listFiles,
  readFile,
  writeFile,
  persistWorkspace,
  updateEnvVars,
  installPackage,
} from "./sandbox-engine";
import {
  runPassiveWebScan,
  runPortScan,
  checkSSL,
  analyzeCodeSecurity,
} from "./security-tools";
import {
  fixSingleVulnerability,
  fixAllVulnerabilities,
  generateFixReport,
} from "./auto-fix-engine";

export const sandboxRouter = router({
  /**
   * List all sandboxes for the current user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return listSandboxes(ctx.user.id);
  }),

  /**
   * Get a specific sandbox by ID
   */
  get: protectedProcedure
    .input(z.object({ sandboxId: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const sandbox = await getSandbox(input.sandboxId, ctx.user.id);
      if (!sandbox) throw new Error("Sandbox not found");
      return sandbox;
    }),

  /**
   * Create a new sandbox
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        memoryMb: z.number().int().min(128).max(2048).optional(),
        diskMb: z.number().int().min(256).max(8192).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return createSandbox(ctx.user.id, input.name, {
        memoryMb: input.memoryMb,
        diskMb: input.diskMb,
      });
    }),

  /**
   * Delete a sandbox
   */
  delete: protectedProcedure
    .input(z.object({ sandboxId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const success = await deleteSandbox(input.sandboxId, ctx.user.id);
      if (!success) throw new Error("Sandbox not found or delete failed");
      return { success: true };
    }),

  /**
   * Execute a command in a sandbox
   */
  exec: protectedProcedure
    .input(
      z.object({
        sandboxId: z.number().int(),
        command: z.string().min(1).max(10_000),
        timeoutMs: z.number().int().min(1000).max(300_000).optional(),
        workingDirectory: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return executeCommand(input.sandboxId, ctx.user.id, input.command, {
        timeoutMs: input.timeoutMs,
        triggeredBy: "user",
        workingDirectory: input.workingDirectory,
      });
    }),

  /**
   * Get command history for a sandbox
   */
  history: protectedProcedure
    .input(
      z.object({
        sandboxId: z.number().int(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      return getCommandHistory(input.sandboxId, ctx.user.id, input.limit ?? 50);
    }),

  /**
   * List files in a sandbox directory
   */
  listFiles: protectedProcedure
    .input(
      z.object({
        sandboxId: z.number().int(),
        path: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      return listFiles(input.sandboxId, ctx.user.id, input.path ?? "/home/sandbox");
    }),

  /**
   * Read a file from the sandbox
   */
  readFile: protectedProcedure
    .input(
      z.object({
        sandboxId: z.number().int(),
        path: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const content = await readFile(input.sandboxId, ctx.user.id, input.path);
      if (content === null) throw new Error("File not found");
      return { content };
    }),

  /**
   * Write a file to the sandbox
   */
  writeFile: protectedProcedure
    .input(
      z.object({
        sandboxId: z.number().int(),
        path: z.string(),
        content: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const success = await writeFile(input.sandboxId, ctx.user.id, input.path, input.content);
      if (!success) throw new Error("Failed to write file");
      return { success: true };
    }),

  /**
   * Save sandbox workspace to S3
   */
  persist: protectedProcedure
    .input(z.object({ sandboxId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const url = await persistWorkspace(input.sandboxId, ctx.user.id) as string | null;
      if (!url) throw new Error("Failed to persist workspace");
      return { url };
    }),

  /**
   * Update environment variables
   */
  updateEnv: protectedProcedure
    .input(
      z.object({
        sandboxId: z.number().int(),
        envVars: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const success = await updateEnvVars(input.sandboxId, ctx.user.id, input.envVars);
      if (!success) throw new Error("Failed to update env vars");
      return { success: true };
    }),

  /**
   * Install a package in the sandbox
   */
  installPackage: protectedProcedure
    .input(
      z.object({
        sandboxId: z.number().int(),
        packageManager: z.enum(["apt", "pip", "npm"]),
        packageName: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return installPackage(
        input.sandboxId,
        ctx.user.id,
        input.packageManager,
        input.packageName
      );
    }),

  /**
   * Rename a sandbox
   */
  rename: protectedProcedure
    .input(
      z.object({
        sandboxId: z.number().int(),
        name: z.string().min(1).max(128),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const { sandboxes } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const sandbox = await getSandbox(input.sandboxId, ctx.user.id);
      if (!sandbox) throw new Error("Sandbox not found");
      await db
        .update(sandboxes)
        .set({ name: input.name })
        .where(and(eq(sandboxes.id, input.sandboxId), eq(sandboxes.userId, ctx.user.id)));
      return { success: true };
    }),

  /**
   * Delete a file from the sandbox
   */
  deleteFile: protectedProcedure
    .input(
      z.object({
        sandboxId: z.number().int(),
        path: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await executeCommand(input.sandboxId, ctx.user.id, `rm -rf "${input.path}"`, {
        triggeredBy: "user",
      });
      return { success: result.exitCode === 0 };
    }),

  /**
   * Create a directory in the sandbox
   */
  createDir: protectedProcedure
    .input(
      z.object({
        sandboxId: z.number().int(),
        path: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await executeCommand(input.sandboxId, ctx.user.id, `mkdir -p "${input.path}"`, {
        triggeredBy: "user",
      });
      return { success: result.exitCode === 0 };
    }),

  /**
   * Get environment variables for a sandbox
   */
  getEnv: protectedProcedure
    .input(z.object({ sandboxId: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const sandbox = await getSandbox(input.sandboxId, ctx.user.id);
      if (!sandbox) throw new Error("Sandbox not found");
      return sandbox.envVars || {};
    }),

  /**
   * Delete an environment variable
   */
  deleteEnv: protectedProcedure
    .input(
      z.object({
        sandboxId: z.number().int(),
        key: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const { sandboxes } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const sandbox = await getSandbox(input.sandboxId, ctx.user.id);
      if (!sandbox) throw new Error("Sandbox not found");
      const envVars = { ...(sandbox.envVars || {}) };
      delete envVars[input.key];
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(sandboxes).set({ envVars }).where(eq(sandboxes.id, input.sandboxId));
      return { success: true };
    }),

  /**
   * Get installed packages for a sandbox
   */
  getPackages: protectedProcedure
    .input(z.object({ sandboxId: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const sandbox = await getSandbox(input.sandboxId, ctx.user.id);
      if (!sandbox) throw new Error("Sandbox not found");
      return sandbox.installedPackages || [];
    }),

  // ─── Security Tools ─────────────────────────────────────────────

  /**
   * Run a passive web scan on a target URL
   */
  securityScan: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      return runPassiveWebScan(input.url);
    }),

  /**
   * Run a port scan on a target host
   */
  portScan: protectedProcedure
    .input(z.object({ host: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return runPortScan(input.host);
    }),

  /**
   * Check SSL certificate for a domain
   */
  sslCheck: protectedProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return checkSSL(input.domain);
    }),

  /**
   * Analyze code for security vulnerabilities
   */
  codeReview: protectedProcedure
    .input(
      z.object({
        code: z.string().min(1),
        language: z.string().optional(),
        filename: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return analyzeCodeSecurity([{ filename: input.filename || "code.txt", content: input.code }]);
    }),

  // ── Auto-Fix Endpoints ──────────────────────────────────────────

  /**
   * Fix a single vulnerability in code
   */
  fixVulnerability: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        code: z.string(),
        issue: z.object({
          title: z.string(),
          severity: z.enum(["critical", "high", "medium", "low"]),
          category: z.enum(["security", "performance", "best-practices", "maintainability"]),
          description: z.string(),
          suggestion: z.string(),
          file: z.string(),
          line: z.number().optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const fix = await fixSingleVulnerability({
        code: input.code,
        filename: input.filename,
        issue: input.issue,
      });
      return fix;
    }),

  /**
   * Fix all vulnerabilities in a batch
   */
  fixAllVulnerabilities: protectedProcedure
    .input(
      z.object({
        files: z.array(
          z.object({
            filename: z.string(),
            content: z.string(),
          })
        ),
        issues: z.array(
          z.object({
            title: z.string(),
            severity: z.enum(["critical", "high", "medium", "low"]),
            category: z.enum(["security", "performance", "best-practices", "maintainability"]),
            description: z.string(),
            suggestion: z.string(),
            file: z.string(),
            line: z.number().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const result = await fixAllVulnerabilities({
        files: input.files,
        report: {
          overallScore: 0,
          issues: input.issues,
          summary: `Batch fix for ${input.issues.length} vulnerabilities`,
          strengths: [],
          recommendations: [],
        },
      });
      const report = generateFixReport(result);
      return { ...result, report };
    }),

  // ── Project Files (from Builder create_file) ─────────────────────

  /**
   * List all project files created by the builder for this user.
   * Reads from the sandboxFiles database table (S3-backed).
   */
  projectFiles: protectedProcedure
    .input(z.object({ conversationId: z.number().int().optional() }).optional())
    .query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const { sandboxFiles } = await import("../drizzle/schema");
      const { eq, and, desc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { files: [], projects: [] };

      // Get user's sandbox
      const sandboxes = await listSandboxes(ctx.user.id);
      if (sandboxes.length === 0) return { files: [], projects: [] };
      const sbId = sandboxes[0].id;

      // Get all files from the database
      const allFiles = await db
        .select()
        .from(sandboxFiles)
        .where(and(eq(sandboxFiles.sandboxId, sbId), eq(sandboxFiles.isDirectory, 0)))
        .orderBy(desc(sandboxFiles.createdAt));

      // Group files by their top-level directory (project)
      const projectMap = new Map<string, typeof allFiles>();
      for (const file of allFiles) {
        const parts = file.filePath.split("/");
        const projectName = parts.length > 1 ? parts[0] : "general";
        if (!projectMap.has(projectName)) projectMap.set(projectName, []);
        projectMap.get(projectName)!.push(file);
      }

      const projects = Array.from(projectMap.entries()).map(([name, files]) => ({
        name,
        fileCount: files.length,
        totalSize: files.reduce((sum, f) => sum + (f.fileSize || 0), 0),
        lastModified: files[0]?.createdAt || null,
      }));

      return {
        files: allFiles.map(f => ({
          id: f.id,
          path: f.filePath,
          name: f.filePath.split("/").pop() || f.filePath,
          size: f.fileSize || 0,
          s3Key: f.s3Key,
          hasContent: !!f.content,
          createdAt: f.createdAt,
        })),
        projects,
      };
    }),

  /**
   * Read a project file's content from the database or S3.
   */
  projectFileContent: protectedProcedure
    .input(z.object({ fileId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const { sandboxFiles } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { content: null, error: "Database unavailable" };

      const sandboxes = await listSandboxes(ctx.user.id);
      if (sandboxes.length === 0) return { content: null, error: "No sandbox found" };

      const [file] = await db
        .select()
        .from(sandboxFiles)
        .where(and(eq(sandboxFiles.id, input.fileId), eq(sandboxFiles.sandboxId, sandboxes[0].id)))
        .limit(1);

      if (!file) return { content: null, error: "File not found" };

      // Return content from database if available
      if (file.content) {
        return { content: file.content, path: file.filePath };
      }

      // Otherwise fetch from S3
      if (file.s3Key) {
        try {
          const { storageGet } = await import("./storage");
          const { url } = await storageGet(file.s3Key);
          const res = await fetch(url);
          if (res.ok) {
            const content = await res.text();
            return { content, path: file.filePath };
          }
        } catch {}
      }

      return { content: null, error: "Content unavailable" };
    }),

  // ── Get a signed download URL for a single project file ──
  projectFileDownloadUrl: protectedProcedure
    .input(z.object({ fileId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const { sandboxFiles } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { url: null, error: "Database unavailable" };
      const sandboxes = await listSandboxes(ctx.user.id);
      if (sandboxes.length === 0) return { url: null, error: "No sandbox found" };
      const [file] = await db
        .select()
        .from(sandboxFiles)
        .where(and(eq(sandboxFiles.id, input.fileId), eq(sandboxFiles.sandboxId, sandboxes[0].id)))
        .limit(1);
      if (!file) return { url: null, error: "File not found" };
      if (file.s3Key) {
        try {
          const { storageGet } = await import("./storage");
          const { url } = await storageGet(file.s3Key);
          return { url, fileName: file.filePath.split("/").pop() || "file" };
        } catch {}
      }
      return { url: null, error: "No download available" };
    }),

  // ── Delete a single project file ──
  deleteProjectFile: protectedProcedure
    .input(z.object({ fileId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const { sandboxFiles } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { success: false, error: "Database unavailable" };
      const sandboxes = await listSandboxes(ctx.user.id);
      if (sandboxes.length === 0) return { success: false, error: "No sandbox found" };
      const [file] = await db
        .select()
        .from(sandboxFiles)
        .where(and(eq(sandboxFiles.id, input.fileId), eq(sandboxFiles.sandboxId, sandboxes[0].id)))
        .limit(1);
      if (!file) return { success: false, error: "File not found" };
      // Delete from S3 if applicable
      if (file.s3Key) {
        try {
          const { storageDelete } = await import("./storage");
          await storageDelete(file.s3Key);
        } catch {}
      }
      await db.delete(sandboxFiles).where(eq(sandboxFiles.id, input.fileId));
      return { success: true };
    }),

  // ── Delete an entire project (all files with matching path prefix) ──
  deleteProject: protectedProcedure
    .input(z.object({ projectName: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const { sandboxFiles } = await import("../drizzle/schema");
      const { eq, and, like } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { success: false, error: "Database unavailable", deleted: 0 };
      const sandboxes = await listSandboxes(ctx.user.id);
      if (sandboxes.length === 0) return { success: false, error: "No sandbox found", deleted: 0 };
      // Find all files belonging to this project (path starts with projectName/)
      const files = await db
        .select()
        .from(sandboxFiles)
        .where(and(
          eq(sandboxFiles.sandboxId, sandboxes[0].id),
          like(sandboxFiles.filePath, `${input.projectName}/%`)
        ));
      // Also include files with exact match (no subdirectory)
      const exactFiles = await db
        .select()
        .from(sandboxFiles)
        .where(and(
          eq(sandboxFiles.sandboxId, sandboxes[0].id),
          eq(sandboxFiles.filePath, input.projectName)
        ));
      const allFiles = [...files, ...exactFiles];
      if (allFiles.length === 0) return { success: false, error: "No files found for this project", deleted: 0 };
      // Delete S3 objects
      for (const file of allFiles) {
        if (file.s3Key) {
          try {
            const { storageDelete } = await import("./storage");
            await storageDelete(file.s3Key);
          } catch {}
        }
      }
      // Delete from DB
      const { inArray } = await import("drizzle-orm");
      await db.delete(sandboxFiles).where(
        inArray(sandboxFiles.id, allFiles.map(f => f.id))
      );
      return { success: true, deleted: allFiles.length };
    }),

  // ── Delete multiple project files ──
  deleteProjectFiles: protectedProcedure
    .input(z.object({ fileIds: z.array(z.number().int()) }))
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const { sandboxFiles } = await import("../drizzle/schema");
      const { eq, and, inArray } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { success: false, error: "Database unavailable" };
      const sandboxes = await listSandboxes(ctx.user.id);
      if (sandboxes.length === 0) return { success: false, error: "No sandbox found" };
      // Get files to delete S3 objects
      const files = await db
        .select()
        .from(sandboxFiles)
        .where(and(
          inArray(sandboxFiles.id, input.fileIds),
          eq(sandboxFiles.sandboxId, sandboxes[0].id)
        ));
      // Delete S3 objects
      for (const file of files) {
        if (file.s3Key) {
          try {
            const { storageDelete } = await import("./storage");
            await storageDelete(file.s3Key);
          } catch {}
        }
      }
      // Delete from DB
      if (files.length > 0) {
        await db.delete(sandboxFiles).where(
          inArray(sandboxFiles.id, files.map(f => f.id))
        );
      }
      return { success: true, deleted: files.length };
    }),
});
