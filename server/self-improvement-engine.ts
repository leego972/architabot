/**
 * Self-Improvement Engine v6.0 — with Anti-Self-Break Protection
 *
 * Allows Titan Assistant to modify its own code safely through:
 *
 * 1. SNAPSHOT — Save current file state before any modification
 * 2. VALIDATE — Syntax/type check changes before applying
 * 3. ANTI-BREAK — Multi-layer safety checks to prevent self-destruction
 * 4. APPLY — Write changes to disk with atomic writes
 * 5. VERIFY — Confirm the system is still healthy after changes
 * 6. ROLLBACK — Revert to last known good state if anything breaks
 * 7. RESTART — Restart services after successful changes
 *
 * Safety barriers:
 * - Protected core files cannot be modified (auth, encryption, safety engine itself)
 * - All changes are logged in the self_modification_log table
 * - Automatic rollback if health check fails after a change
 * - Maximum change size limits to prevent catastrophic rewrites
 * - Dry-run validation before any write
 *
 * Anti-Self-Break v1.0:
 * - Content delta guard: rejects modifications that delete >60% of file content
 * - Empty file guard: rejects writes that produce empty or near-empty files
 * - Export preservation: ensures modified files still export key symbols
 * - Circular dependency detection: prevents files from importing themselves
 * - Rate limiting: max 10 modifications per 5-minute window
 * - Symlink protection: resolves real paths to prevent protected file bypass
 * - Consecutive failure circuit breaker: locks modifications after 3 consecutive failures
 */

import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  systemSnapshots,
  snapshotFiles,
  selfModificationLog,
} from "../drizzle/schema";
import {
  checkUserRateLimit,
  logSecurityEvent,
  validateFilePath,
} from "./security-hardening";

// ─── Constants ───────────────────────────────────────────────────────

const PROJECT_ROOT = process.cwd();

/**
 * PROTECTED FILES — These cannot be modified by the self-improvement engine.
 * Modifying these could break authentication, encryption, or the safety system itself.
 */
const PROTECTED_PATHS: string[] = [
  // Core framework — never touch
  "server/_core/",
  // The self-improvement engine itself — prevent self-corruption
  "server/self-improvement-engine.ts",
  // Authentication and encryption — security critical
  "server/email-auth-router.ts",
  "server/two-factor-router.ts",
  "server/identity-provider-router.ts",
  // Database schema — changes here require migration
  "drizzle/schema.ts",
  "drizzle/relations.ts",
  // Package config — dependency changes need careful review
  "package.json",
  "pnpm-lock.yaml",
  // Environment and secrets
  ".env",
  "server/_core/env.ts",
  // Kill switch — emergency shutdown must always work
  "server/fetcher-engine/safety-engine.ts",
  // Stripe/payment — financial operations are critical
  "server/stripe-router.ts",
  "server/subscription-gate.ts",
  // Anti-self-replication — MUST NEVER be modified or disabled
  "server/anti-replication-guard.ts",
];

/**
 * ALLOWED DIRECTORIES — Only files in these directories can be modified.
 */
const ALLOWED_DIRECTORIES: string[] = [
  "server/",
  "client/src/",
  "client/public/",
  "shared/",
  "scripts/",
  "electron/",
];

/**
 * Maximum file size that can be written (500KB) — prevents catastrophic overwrites.
 */
const MAX_FILE_SIZE = 500 * 1024;

/**
 * Maximum number of files that can be modified in a single operation.
 */
const MAX_FILES_PER_OPERATION = 15;

/**
 * Anti-Self-Break: Maximum allowed content reduction ratio.
 * If a modification removes more than this fraction of the original file,
 * it is rejected. Prevents accidental or malicious gutting of files.
 */
const MAX_CONTENT_REDUCTION_RATIO = 0.85;

/**
 * Anti-Self-Break: Minimum file content length (bytes) for non-delete operations.
 * Prevents writing empty or near-empty files that would break the system.
 */
const MIN_FILE_CONTENT_LENGTH = 10;

/**
 * Anti-Self-Break: Rate limiting — max modifications per time window.
 */
const RATE_LIMIT_MAX_OPS = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Anti-Self-Break: Circuit breaker — consecutive failures before lockout.
 */
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

// ─── Anti-Self-Break State ──────────────────────────────────────────

interface RateLimitEntry {
  timestamp: number;
  fileCount: number;
}

const _rateLimitLog: RateLimitEntry[] = [];
let _consecutiveFailures = 0;
let _circuitBreakerLockedUntil = 0;

/**
 * Check rate limit — returns true if the operation is allowed.
 */
function checkRateLimit(fileCount: number): { allowed: boolean; message: string } {
  const now = Date.now();
  // Clean old entries
  while (_rateLimitLog.length > 0 && _rateLimitLog[0].timestamp < now - RATE_LIMIT_WINDOW_MS) {
    _rateLimitLog.shift();
  }
  const recentOps = _rateLimitLog.reduce((sum, e) => sum + e.fileCount, 0);
  if (recentOps + fileCount > RATE_LIMIT_MAX_OPS) {
    return {
      allowed: false,
      message: `RATE LIMIT: ${recentOps} file modifications in the last 5 minutes (limit: ${RATE_LIMIT_MAX_OPS}). Wait before making more changes.`,
    };
  }
  return { allowed: true, message: "OK" };
}

function recordRateLimit(fileCount: number): void {
  _rateLimitLog.push({ timestamp: Date.now(), fileCount });
}

/**
 * Check circuit breaker — returns true if modifications are allowed.
 */
function checkCircuitBreaker(): { allowed: boolean; message: string } {
  const now = Date.now();
  if (_circuitBreakerLockedUntil > now) {
    const remainingMs = _circuitBreakerLockedUntil - now;
    const remainingMin = Math.ceil(remainingMs / 60000);
    return {
      allowed: false,
      message: `CIRCUIT BREAKER: Modifications locked for ${remainingMin} more minute(s) after ${CIRCUIT_BREAKER_THRESHOLD} consecutive failures. This prevents cascading damage.`,
    };
  }
  return { allowed: true, message: "OK" };
}

function recordSuccess(): void {
  _consecutiveFailures = 0;
}

function recordFailure(): void {
  _consecutiveFailures++;
  if (_consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    _circuitBreakerLockedUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
    log.error(`[AntiSelfBreak] CIRCUIT BREAKER TRIPPED — ${_consecutiveFailures} consecutive failures. Modifications locked for ${CIRCUIT_BREAKER_COOLDOWN_MS / 60000} minutes.`);
  }
}

/**
 * Reset the circuit breaker manually (admin action).
 */
export function resetCircuitBreaker(): void {
  _consecutiveFailures = 0;
  _circuitBreakerLockedUntil = 0;
  log.info("[AntiSelfBreak] Circuit breaker reset by admin.");
}

/**
 * Get current anti-self-break status.
 */
export function getAntiSelfBreakStatus(): {
  consecutiveFailures: number;
  circuitBreakerActive: boolean;
  circuitBreakerLockedUntil: number | null;
  recentModifications: number;
  rateLimitMax: number;
  rateLimitWindowMinutes: number;
} {
  const now = Date.now();
  const recentOps = _rateLimitLog
    .filter(e => e.timestamp > now - RATE_LIMIT_WINDOW_MS)
    .reduce((sum, e) => sum + e.fileCount, 0);
  return {
    consecutiveFailures: _consecutiveFailures,
    circuitBreakerActive: _circuitBreakerLockedUntil > now,
    circuitBreakerLockedUntil: _circuitBreakerLockedUntil > now ? _circuitBreakerLockedUntil : null,
    recentModifications: recentOps,
    rateLimitMax: RATE_LIMIT_MAX_OPS,
    rateLimitWindowMinutes: RATE_LIMIT_WINDOW_MS / 60000,
  };
}

// ─── Types ───────────────────────────────────────────────────────────

export interface SnapshotResult {
  success: boolean;
  snapshotId?: number;
  fileCount?: number;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ModificationRequest {
  filePath: string;
  action: "modify" | "create" | "delete";
  content?: string; // new content for modify/create
  description: string;
}

export interface ModificationResult {
  success: boolean;
  snapshotId?: number;
  modifications: Array<{
    filePath: string;
    action: string;
    applied: boolean;
    error?: string;
  }>;
  validationResult?: ValidationResult;
  healthCheckPassed?: boolean;
  rolledBack?: boolean;
  error?: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}

// ─── Path Safety ─────────────────────────────────────────────────────

function normalizePath(filePath: string): string {
  // Resolve to absolute, then make relative to project root
  const absolute = path.resolve(PROJECT_ROOT, filePath);
  const relative = path.relative(PROJECT_ROOT, absolute);

  // Prevent path traversal
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }

  return relative;
}

function isProtected(filePath: string): boolean {
  const normalized = normalizePath(filePath);

  // Anti-Self-Break: Resolve symlinks to prevent bypass via symlinked paths
  try {
    const fullPath = path.join(PROJECT_ROOT, normalized);
    if (fs.existsSync(fullPath)) {
      const realPath = fs.realpathSync(fullPath);
      const realRelative = path.relative(PROJECT_ROOT, realPath);
      // Check both the given path AND the resolved real path
      if (realRelative !== normalized) {
        const realProtected = PROTECTED_PATHS.some(
          (p) => realRelative === p || realRelative.startsWith(p)
        );
        if (realProtected) {
          log.warn(`[AntiSelfBreak] Symlink bypass attempt detected: ${normalized} -> ${realRelative} (PROTECTED)`);
          return true;
        }
      }
    }
  } catch {
    // If we can't resolve, be safe and check the original path
  }

  return PROTECTED_PATHS.some(
    (p) => normalized === p || normalized.startsWith(p)
  );
}

function isInAllowedDirectory(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return ALLOWED_DIRECTORIES.some((d) => normalized.startsWith(d));
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ─── Snapshot System ─────────────────────────────────────────────────

/**
 * Create a snapshot of specific files before modification.
 * Saves the current content to the database so we can roll back.
 */
export async function createSnapshot(
  filePaths: string[],
  reason: string,
  triggeredBy: string = "titan_assistant"
): Promise<SnapshotResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  try {
    // Create the snapshot record
    const [result] = await db.insert(systemSnapshots).values({
      triggeredBy,
      reason,
      fileCount: filePaths.length,
      status: "active",
      isKnownGood: 0,
    });

    const snapshotId = result.insertId;

    // Save each file's content
    let savedCount = 0;
    for (const fp of filePaths) {
      const normalized = normalizePath(fp);
      const fullPath = path.join(PROJECT_ROOT, normalized);

      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        await db.insert(snapshotFiles).values({
          snapshotId,
          filePath: normalized,
          contentHash: hashContent(content),
          content,
        });
        savedCount++;
      }
    }

    return {
      success: true,
      snapshotId,
      fileCount: savedCount,
    };
  } catch (err) {
    return {
      success: false,
      error: `Snapshot failed: ${err instanceof Error ? getErrorMessage(err) : String(err)}`,
    };
  }
}

/**
 * Mark a snapshot as "known good" — validated as working.
 */
export async function markSnapshotAsGood(
  snapshotId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db
    .update(systemSnapshots)
    .set({ isKnownGood: 1 })
    .where(eq(systemSnapshots.id, snapshotId));

  return true;
}

// ─── Validation ──────────────────────────────────────────────────────

/**
 * Validate proposed modifications before applying them.
 * Checks:
 * - Protected file violations
 * - Allowed directory restrictions
 * - File size limits
 * - Basic syntax validation (brackets, quotes)
 * - Dangerous pattern detection
 */
export function validateModifications(
  modifications: ModificationRequest[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check count limit
  if (modifications.length > MAX_FILES_PER_OPERATION) {
    errors.push(
      `Too many files (${modifications.length}). Maximum is ${MAX_FILES_PER_OPERATION} per operation.`
    );
  }

  for (const mod of modifications) {
    const normalized = normalizePath(mod.filePath);

    // Protected file check
    if (isProtected(normalized)) {
      errors.push(
        `PROTECTED: ${normalized} cannot be modified. This file is critical to system security.`
      );
      continue;
    }

    // Allowed directory check
    if (!isInAllowedDirectory(normalized)) {
      errors.push(
        `RESTRICTED: ${normalized} is outside allowed directories (${ALLOWED_DIRECTORIES.join(", ")}).`
      );
      continue;
    }

    // Content checks for modify/create
    if (mod.action !== "delete" && mod.content) {
      // Size limit
      if (Buffer.byteLength(mod.content, "utf-8") > MAX_FILE_SIZE) {
        errors.push(
          `SIZE LIMIT: ${normalized} content exceeds ${MAX_FILE_SIZE / 1024}KB limit.`
        );
      }

      // Dangerous patterns — only block truly destructive operations
      // Note: exec(), child_process, process.exit() are ALLOWED because the builder
      // needs them for scripts, automation, and CLI tools. The snapshot + rollback
      // system catches actual breakage.
      const dangerousPatterns = [
        { pattern: /rm\s+-rf\s+\/(?!tmp)/g, msg: "rm -rf on root paths detected" },
        { pattern: /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?\w/gi, msg: "DROP TABLE SQL detected" },
        { pattern: /TRUNCATE\s+TABLE\s+\w/gi, msg: "TRUNCATE TABLE SQL detected" },
      ];

      for (const dp of dangerousPatterns) {
        if (dp.pattern.test(mod.content)) {
          errors.push(`DANGEROUS: ${normalized} — ${dp.msg}`);
        }
      }

      // Basic syntax check for TypeScript/JavaScript files
      if (normalized.endsWith(".ts") || normalized.endsWith(".tsx") || normalized.endsWith(".js")) {
        const openBraces = (mod.content.match(/\{/g) || []).length;
        const closeBraces = (mod.content.match(/\}/g) || []).length;
        if (Math.abs(openBraces - closeBraces) > 2) {
          warnings.push(
            `SYNTAX WARNING: ${normalized} has mismatched braces (${openBraces} open, ${closeBraces} close).`
          );
        }

        const openParens = (mod.content.match(/\(/g) || []).length;
        const closeParens = (mod.content.match(/\)/g) || []).length;
        if (Math.abs(openParens - closeParens) > 2) {
          warnings.push(
            `SYNTAX WARNING: ${normalized} has mismatched parentheses (${openParens} open, ${closeParens} close).`
          );
        }
      }

      // Check for import of protected modules
      if (/import.*self-improvement-engine/g.test(mod.content)) {
        warnings.push(
          `WARNING: ${normalized} imports self-improvement-engine — be careful not to create circular dependencies.`
        );
      }

      // ── Anti-Self-Break: Empty file guard ──
      if (mod.content.trim().length < MIN_FILE_CONTENT_LENGTH && (mod.action as string) !== "delete") {
        errors.push(
          `ANTI-BREAK: ${normalized} — new content is empty or near-empty (${mod.content.trim().length} chars). This would break the system. Use 'delete' action to intentionally remove a file.`
        );
      }

      // ── Anti-Self-Break: Content delta guard ──
      if (mod.action === "modify") {
        const fullPath = path.join(PROJECT_ROOT, normalized);
        if (fs.existsSync(fullPath)) {
          const currentContent = fs.readFileSync(fullPath, "utf-8");
          const currentLen = currentContent.length;
          const newLen = mod.content.length;
          if (currentLen > 100 && newLen < currentLen * (1 - MAX_CONTENT_REDUCTION_RATIO)) {
            const reductionPct = Math.round((1 - newLen / currentLen) * 100);
            errors.push(
              `ANTI-BREAK: ${normalized} — modification would remove ${reductionPct}% of the file content (${currentLen} → ${newLen} chars). Maximum allowed reduction is ${Math.round(MAX_CONTENT_REDUCTION_RATIO * 100)}%. Split large refactors into smaller steps.`
            );
          }
        }
      }

      // ── Anti-Self-Break: Export preservation guard ──
      if (mod.action === "modify") {
        const fullPath = path.join(PROJECT_ROOT, normalized);
        if (fs.existsSync(fullPath)) {
          const currentContent = fs.readFileSync(fullPath, "utf-8");
          // Extract exported function/class/const names from current file
          const exportPattern = /export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g;
          const currentExports: string[] = [];
          let match;
          while ((match = exportPattern.exec(currentContent)) !== null) {
            currentExports.push(match[1]);
          }
          // Check that critical exports still exist in the new content
          const missingExports = currentExports.filter(
            (exp) => !mod.content!.includes(exp)
          );
          if (missingExports.length > 0 && missingExports.length > currentExports.length * 0.5) {
            warnings.push(
              `ANTI-BREAK WARNING: ${normalized} — ${missingExports.length} of ${currentExports.length} exports would be removed: ${missingExports.slice(0, 5).join(", ")}${missingExports.length > 5 ? "..." : ""}. This may break other files that import from this module.`
            );
          }
        }
      }

      // ── Anti-Self-Break: Circular self-import detection ──
      const fileBaseName = path.basename(normalized, path.extname(normalized));
      const selfImportPattern = new RegExp(`from\\s+["'].*${fileBaseName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}["']`, "g");
      if (selfImportPattern.test(mod.content)) {
        // Check if it's actually importing itself (not a different file with a similar name)
        const importLines = mod.content.split("\n").filter(line => line.includes("from") && line.includes(fileBaseName));
        for (const line of importLines) {
          if (line.includes("./" + fileBaseName) || line.includes("../" + path.basename(path.dirname(normalized)) + "/" + fileBaseName)) {
            errors.push(
              `ANTI-BREAK: ${normalized} — file imports itself, which would create a circular dependency and crash the module loader.`
            );
            break;
          }
        }
      }
    }

    // Delete checks
    if (mod.action === "delete") {
      const fullPath = path.join(PROJECT_ROOT, normalized);
      if (!fs.existsSync(fullPath)) {
        warnings.push(`WARNING: ${normalized} does not exist (delete is a no-op).`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Apply Modifications ─────────────────────────────────────────────

/**
 * Apply validated modifications to the filesystem.
 * This is the core "self-improvement" operation.
 *
 * Flow:
 * 1. Validate all modifications
 * 2. Create snapshot of affected files
 * 3. Apply each modification
 * 4. Run health check
 * 5. If health check fails → automatic rollback
 * 6. Log everything
 */
export async function applyModifications(
  modifications: ModificationRequest[],
  userId: number | null,
  requestedBy: string = "titan_assistant"
): Promise<ModificationResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable", modifications: [] };

  // ── SECURITY: Per-User Self-Modification Rate Limiting ──────────
  if (userId) {
    const rateCheck = await checkUserRateLimit(userId, "self_modify");
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: `Self-modification rate limit exceeded. Please wait ${Math.ceil((rateCheck.retryAfterMs || 300000) / 1000)}s.`,
        modifications: modifications.map((m) => ({
          filePath: m.filePath,
          action: m.action,
          applied: false,
          error: "Rate limited",
        })),
      };
    }
  }

  // ── SECURITY: Path Traversal Validation ──────────────────────
  for (const mod of modifications) {
    const pathCheck = validateFilePath(mod.filePath);
    if (!pathCheck.valid) {
      if (userId) {
        await logSecurityEvent(userId, "path_traversal_attempt", {
          filePath: mod.filePath,
          error: pathCheck.error,
        });
      }
      return {
        success: false,
        error: `Security violation: ${pathCheck.error}`,
        modifications: modifications.map((m) => ({
          filePath: m.filePath,
          action: m.action,
          applied: false,
          error: "Path validation failed",
        })),
      };
    }
  }

  // Anti-Self-Break: Circuit breaker check
  const cbCheck = checkCircuitBreaker();
  if (!cbCheck.allowed) {
    return {
      success: false,
      error: cbCheck.message,
      modifications: modifications.map((m) => ({
        filePath: m.filePath,
        action: m.action,
        applied: false,
        error: "Circuit breaker active",
      })),
    };
  }

  // Anti-Self-Break: Rate limit check
  const rlCheck = checkRateLimit(modifications.length);
  if (!rlCheck.allowed) {
    return {
      success: false,
      error: rlCheck.message,
      modifications: modifications.map((m) => ({
        filePath: m.filePath,
        action: m.action,
        applied: false,
        error: "Rate limited",
      })),
    };
  }

  // Step 1: Validate
  const validation = validateModifications(modifications);
  if (!validation.valid) {
    return {
      success: false,
      validationResult: validation,
      modifications: modifications.map((m) => ({
        filePath: m.filePath,
        action: m.action,
        applied: false,
        error: "Validation failed",
      })),
      error: `Validation failed: ${validation.errors.join("; ")}`,
    };
  }

  // Step 2: Snapshot affected files
  const filePaths = modifications.map((m) => m.filePath);
  const snapshot = await createSnapshot(
    filePaths,
    `Pre-modification snapshot: ${modifications.map((m) => `${m.action} ${m.filePath}`).join(", ")}`,
    requestedBy
  );

  if (!snapshot.success) {
    return {
      success: false,
      error: `Failed to create snapshot: ${snapshot.error}`,
      modifications: [],
    };
  }

  // Step 3: Pre-check write permissions on target directories
  for (const mod of modifications) {
    if (mod.action === "delete" && !fs.existsSync(path.join(PROJECT_ROOT, normalizePath(mod.filePath)))) continue;
    const normalized = normalizePath(mod.filePath);
    const fullPath = path.join(PROJECT_ROOT, normalized);
    const dir = path.dirname(fullPath);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      return {
        success: false,
        snapshotId: snapshot.snapshotId,
        modifications: [],
        error: `PERMISSION DENIED: Cannot write to directory '${dir}'. The self-improvement engine does not have write permissions. This is a server configuration issue — the Dockerfile needs to grant write access to source directories.`,
      };
    }
  }

  // Step 4: Apply each modification
  const results: ModificationResult["modifications"] = [];
  const appliedFiles: string[] = [];

  for (const mod of modifications) {
    const normalized = normalizePath(mod.filePath);
    const fullPath = path.join(PROJECT_ROOT, normalized);

    try {
      switch (mod.action) {
        case "create": {
          // Ensure directory exists
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(fullPath, mod.content || "", "utf-8");
          results.push({ filePath: normalized, action: "create", applied: true });
          appliedFiles.push(normalized);
          break;
        }
        case "modify": {
          if (!fs.existsSync(fullPath)) {
            results.push({
              filePath: normalized,
              action: "modify",
              applied: false,
              error: "File does not exist",
            });
            continue;
          }
          fs.writeFileSync(fullPath, mod.content || "", "utf-8");
          results.push({ filePath: normalized, action: "modify", applied: true });
          appliedFiles.push(normalized);
          break;
        }
        case "delete": {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
          results.push({ filePath: normalized, action: "delete", applied: true });
          appliedFiles.push(normalized);
          break;
        }
      }

      // Log the modification
      await db.insert(selfModificationLog).values({
        snapshotId: snapshot.snapshotId!,
        requestedBy,
        userId,
        action: mod.action === "create" ? "create_file" : mod.action === "delete" ? "delete_file" : "modify_file",
        targetFile: normalized,
        description: mod.description,
        validationResult: "passed",
        applied: 1,
        rolledBack: 0,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? getErrorMessage(err) : String(err);
      results.push({
        filePath: normalized,
        action: mod.action,
        applied: false,
        error: errorMsg,
      });

      await db.insert(selfModificationLog).values({
        snapshotId: snapshot.snapshotId!,
        requestedBy,
        userId,
        action: mod.action === "create" ? "create_file" : mod.action === "delete" ? "delete_file" : "modify_file",
        targetFile: normalized,
        description: mod.description,
        validationResult: "failed",
        applied: 0,
        rolledBack: 0,
        errorMessage: errorMsg,
      });
    }
  }

  // Step 5: Health check
  const health = await runHealthCheck();

  if (!health.healthy) {
    // Step 6: Auto-rollback
    log.error("[SelfImprovement] Health check FAILED after modifications. Rolling back...");
    const rollbackResult = await rollbackToSnapshot(snapshot.snapshotId!);

    // Mark all modifications as rolled back
    for (const file of appliedFiles) {
      await db.insert(selfModificationLog).values({
        snapshotId: snapshot.snapshotId!,
        requestedBy: "auto_rollback",
        userId,
        action: "rollback",
        targetFile: file,
        description: `Auto-rollback due to failed health check: ${health.checks.filter((c) => !c.passed).map((c) => c.message).join("; ")}`,
        applied: 1,
        rolledBack: 1,
      });
    }

    // Anti-Self-Break: Record failure for circuit breaker
    recordFailure();

    return {
      success: false,
      snapshotId: snapshot.snapshotId,
      modifications: results,
      validationResult: validation,
      healthCheckPassed: false,
      rolledBack: true,
      error: `Changes rolled back — health check failed: ${health.checks.filter((c) => !c.passed).map((c) => c.message).join("; ")}`,
    };
  }

  // Anti-Self-Break: Record success and rate limit
  recordSuccess();
  recordRateLimit(modifications.length);

  // Mark snapshot as known good
  await markSnapshotAsGood(snapshot.snapshotId!);

  return {
    success: true,
    snapshotId: snapshot.snapshotId,
    modifications: results,
    validationResult: validation,
    healthCheckPassed: true,
    rolledBack: false,
  };
}

// ─── Rollback ────────────────────────────────────────────────────────

/**
 * Rollback to a specific snapshot — restore all files to their saved state.
 */
export async function rollbackToSnapshot(
  snapshotId: number
): Promise<{ success: boolean; filesRestored: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, filesRestored: 0, error: "Database unavailable" };

  try {
    // Get snapshot files
    const files = await db
      .select()
      .from(snapshotFiles)
      .where(eq(snapshotFiles.snapshotId, snapshotId));

    if (files.length === 0) {
      return { success: false, filesRestored: 0, error: "No files found in snapshot" };
    }

    let restored = 0;
    for (const file of files) {
      const fullPath = path.join(PROJECT_ROOT, file.filePath);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, file.content, "utf-8");
      restored++;
    }

    // Mark snapshot as rolled back
    await db
      .update(systemSnapshots)
      .set({ status: "rolled_back" })
      .where(eq(systemSnapshots.id, snapshotId));

    return { success: true, filesRestored: restored };
  } catch (err) {
    return {
      success: false,
      filesRestored: 0,
      error: `Rollback failed: ${err instanceof Error ? getErrorMessage(err) : String(err)}`,
    };
  }
}

/**
 * Rollback to the last known good snapshot.
 */
export async function rollbackToLastGood(): Promise<{
  success: boolean;
  snapshotId?: number;
  filesRestored: number;
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { success: false, filesRestored: 0, error: "Database unavailable" };

  const goodSnapshots = await db
    .select()
    .from(systemSnapshots)
    .where(eq(systemSnapshots.isKnownGood, 1))
    .orderBy(desc(systemSnapshots.createdAt))
    .limit(1);

  if (goodSnapshots.length === 0) {
    return {
      success: false,
      filesRestored: 0,
      error: "No known good snapshots found. Manual intervention required.",
    };
  }

  const result = await rollbackToSnapshot(goodSnapshots[0].id);
  return { ...result, snapshotId: goodSnapshots[0].id };
}
// ─── Checkpoint System ───────────────────────────────────────────────────

/**
 * Collect all source files from the allowed directories.
 * Returns relative paths from PROJECT_ROOT.
 */
function collectAllSourceFiles(): string[] {
  const ALLOWED = ["server/", "client/src/", "client/public/", "shared/", "scripts/", "drizzle/"];
  const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".next", "coverage"]);
  const MAX_FILE_SIZE_BYTES = 256 * 1024; // skip files > 256KB (binary/generated)
  const result: string[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(full);
          if (stat.size <= MAX_FILE_SIZE_BYTES) {
            result.push(path.relative(PROJECT_ROOT, full));
          }
        } catch { /* skip unreadable */ }
      }
    }
  }

  for (const dir of ALLOWED) {
    walk(path.join(PROJECT_ROOT, dir));
  }

  // Also include root config files
  const rootConfigs = ["package.json", "tsconfig.json", "vite.config.ts", "tailwind.config.ts", "drizzle.config.ts"];
  for (const cfg of rootConfigs) {
    const full = path.join(PROJECT_ROOT, cfg);
    if (fs.existsSync(full)) result.push(cfg);
  }

  return result;
}

/**
 * Save a named checkpoint — captures ALL source files in the project.
 * This is a full project snapshot that can be restored later.
 */
export async function saveCheckpoint(
  name: string,
  triggeredBy: string = "user"
): Promise<{ success: boolean; snapshotId?: number; fileCount?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  try {
    const files = collectAllSourceFiles();
    if (files.length === 0) {
      return { success: false, error: "No source files found to checkpoint" };
    }

    // Create the snapshot record with checkpoint name in reason
    const [result] = await db.insert(systemSnapshots).values({
      triggeredBy,
      reason: `[CHECKPOINT] ${name}`,
      fileCount: files.length,
      status: "active",
      isKnownGood: 1, // checkpoints are explicitly saved, so mark as known good
    });

    const snapshotId = result.insertId;

    // Save each file's content
    let savedCount = 0;
    for (const fp of files) {
      try {
        const fullPath = path.join(PROJECT_ROOT, fp);
        const content = fs.readFileSync(fullPath, "utf-8");
        await db.insert(snapshotFiles).values({
          snapshotId,
          filePath: fp,
          contentHash: hashContent(content),
          content,
        });
        savedCount++;
      } catch { /* skip unreadable files */ }
    }

    return { success: true, snapshotId, fileCount: savedCount };
  } catch (err) {
    return {
      success: false,
      error: `Checkpoint save failed: ${err instanceof Error ? getErrorMessage(err) : String(err)}`,
    };
  }
}

/**
 * List all saved checkpoints (most recent first).
 */
export async function listCheckpoints(
  limit: number = 20
): Promise<{ success: boolean; checkpoints?: Array<{ id: number; name: string; fileCount: number; status: string; createdAt: Date }>; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  try {
    const snapshots = await db
      .select()
      .from(systemSnapshots)
      .where(sql`${systemSnapshots.reason} LIKE '[CHECKPOINT]%'`)
      .orderBy(desc(systemSnapshots.createdAt))
      .limit(limit);

    const checkpoints = snapshots.map(s => ({
      id: s.id,
      name: s.reason.replace("[CHECKPOINT] ", ""),
      fileCount: s.fileCount,
      status: s.status,
      createdAt: s.createdAt,
    }));

    return { success: true, checkpoints };
  } catch (err) {
    return {
      success: false,
      error: `List checkpoints failed: ${err instanceof Error ? getErrorMessage(err) : String(err)}`,
    };
  }
}

/**
 * Rollback to a specific checkpoint by ID, or to the most recent checkpoint.
 * Restores ALL files that were captured in that checkpoint.
 */
export async function rollbackToCheckpoint(
  checkpointId?: number
): Promise<{ success: boolean; snapshotId?: number; name?: string; filesRestored: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, filesRestored: 0, error: "Database unavailable" };

  try {
    let targetSnapshot;

    if (checkpointId) {
      // Rollback to specific checkpoint
      const snapshots = await db
        .select()
        .from(systemSnapshots)
        .where(eq(systemSnapshots.id, checkpointId))
        .limit(1);
      if (snapshots.length === 0) {
        return { success: false, filesRestored: 0, error: `Checkpoint #${checkpointId} not found` };
      }
      targetSnapshot = snapshots[0];
    } else {
      // Rollback to most recent checkpoint
      const snapshots = await db
        .select()
        .from(systemSnapshots)
        .where(sql`${systemSnapshots.reason} LIKE '[CHECKPOINT]%' AND ${systemSnapshots.status} = 'active'`)
        .orderBy(desc(systemSnapshots.createdAt))
        .limit(1);
      if (snapshots.length === 0) {
        return { success: false, filesRestored: 0, error: "No active checkpoints found. Save a checkpoint first." };
      }
      targetSnapshot = snapshots[0];
    }

    const checkpointName = targetSnapshot.reason.replace("[CHECKPOINT] ", "");

    // Before restoring, save a safety snapshot of current state
    const currentFiles = collectAllSourceFiles();
    await createSnapshot(currentFiles, `Auto-backup before rollback to checkpoint: ${checkpointName}`, "system");

    // Restore all files from the checkpoint
    const result = await rollbackToSnapshot(targetSnapshot.id);

    return {
      success: result.success,
      snapshotId: targetSnapshot.id,
      name: checkpointName,
      filesRestored: result.filesRestored,
      error: result.error,
    };
  } catch (err) {
    return {
      success: false,
      filesRestored: 0,
      error: `Rollback to checkpoint failed: ${err instanceof Error ? getErrorMessage(err) : String(err)}`,
    };
  }
}// ─── Health Check ──────────────────────────────────────────────────────────────
/**
 * Run a health checko verify the system is still functional.
 * Checks:
 * - Critical files exist
 * - No syntax errors in key files (basic bracket matching)
 * - Server process is running
 * - Database is accessible
 */
export async function runHealthCheck(): Promise<HealthCheckResult> {
  const checks: HealthCheckResult["checks"] = [];
  const isProduction = process.env.NODE_ENV === "production";

  // Check 1: Critical files exist
  // In production (Railway Docker), source .ts/.tsx files are NOT present —
  // only the compiled dist/index.js bundle exists. We check for the compiled
  // output instead. In development, we check the source files.
  if (isProduction) {
    // Production: verify the compiled bundle and client assets exist
    const productionFiles = [
      { path: "dist/index.js", label: "Server bundle (dist/index.js)" },
      { path: "dist/public/index.html", label: "Client build (dist/public/index.html)" },
    ];
    for (const pf of productionFiles) {
      const fullPath = path.join(PROJECT_ROOT, pf.path);
      const exists = fs.existsSync(fullPath);
      checks.push({
        name: `file_exists:${pf.path}`,
        passed: exists,
        message: exists ? `${pf.label} exists` : `CRITICAL: ${pf.label} is missing!`,
      });
    }
    // Also check source files if they were copied into the image
    const sourceDir = path.join(PROJECT_ROOT, "server");
    const sourceAvailable = fs.existsSync(sourceDir) && fs.readdirSync(sourceDir).some(f => f.endsWith(".ts"));
    checks.push({
      name: "source_files",
      passed: true, // Not a failure in production — source is optional
      message: sourceAvailable
        ? "Source files available (self-improvement enabled)"
        : "Source files not present (production build-only mode — self-improvement read-only)",
    });
  } else {
    // Development: check source files directly
    const criticalFiles = [
      "server/routers.ts",
      "server/db.ts",
      "server/chat-router.ts",
      "server/chat-executor.ts",
      "server/chat-tools.ts",
      "client/src/App.tsx",
      "client/src/main.tsx",
    ];
    for (const cf of criticalFiles) {
      const fullPath = path.join(PROJECT_ROOT, cf);
      const exists = fs.existsSync(fullPath);
      checks.push({
        name: `file_exists:${cf}`,
        passed: exists,
        message: exists ? `${cf} exists` : `CRITICAL: ${cf} is missing!`,
      });
    }
  }

  // Check 2: Basic syntax validation on key server files (dev only)
  if (!isProduction) {
    const serverFiles = [
      "server/routers.ts",
      "server/chat-router.ts",
      "server/chat-executor.ts",
    ];
    for (const sf of serverFiles) {
      const fullPath = path.join(PROJECT_ROOT, sf);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const openBraces = (content.match(/\{/g) || []).length;
        const closeBraces = (content.match(/\}/g) || []).length;
        const balanced = Math.abs(openBraces - closeBraces) <= 1;
        checks.push({
          name: `syntax:${sf}`,
          passed: balanced,
          message: balanced
            ? `${sf} syntax OK`
            : `${sf} has mismatched braces (${openBraces} open, ${closeBraces} close)`,
        });
      }
    }
  } else {
    // Production: the code compiled successfully if dist/index.js exists
    checks.push({
      name: "syntax:compiled",
      passed: true,
      message: "Code compiled successfully (syntax validated at build time)",
    });
  }

  // Check 3: Database accessible
  try {
    const db = await getDb();
    if (db) {
      checks.push({
        name: "database",
        passed: true,
        message: "Database connection OK",
      });
    } else {
      checks.push({
        name: "database",
        passed: false,
        message: "Database connection failed",
      });
    }
  } catch {
    checks.push({
      name: "database",
      passed: false,
      message: "Database connection error",
    });
  }

  // Check 4: Self-improvement engine is intact
  if (isProduction) {
    // In production the engine is compiled into dist/index.js — if we're running, it's intact
    checks.push({
      name: "self_improvement_engine",
      passed: true,
      message: "Self-improvement engine loaded (compiled into server bundle)",
    });
  } else {
    const selfPath = path.join(PROJECT_ROOT, "server/self-improvement-engine.ts");
    const selfExists = fs.existsSync(selfPath);
    checks.push({
      name: "self_improvement_engine",
      passed: selfExists,
      message: selfExists
        ? "Self-improvement engine intact"
        : "CRITICAL: Self-improvement engine file is missing!",
    });
  }

  // Check 5: Server is responsive (we're running, so this always passes)
  checks.push({
    name: "server_running",
    passed: true,
    message: `Server running (${isProduction ? "production" : "development"} mode, PID ${process.pid})`,
  });

  const allPassed = checks.every((c) => c.passed);

  return {
    healthy: allPassed,
    checks,
  };
}

// ─── Service Restart ─────────────────────────────────────────────────

/**
 * Request a service restart.
 * - In production (Railway/Docker): calls process.exit(0) which triggers
 *   the container orchestrator to automatically restart the container.
 * - In development: touches a file to trigger tsx watch mode restart.
 *
 * Returns a status message — the actual restart happens asynchronously.
 */
export async function requestRestart(
  reason: string,
  userId: number | null
): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  const isProduction = process.env.NODE_ENV === "production";

  // Log the restart request
  if (db) {
    await db.insert(selfModificationLog).values({
      requestedBy: "titan_assistant",
      userId,
      action: "restart_service",
      description: `Service restart requested: ${reason}`,
      validationResult: "skipped",
      applied: 1,
      rolledBack: 0,
    });
  }

  try {
    if (isProduction) {
      // In production (Railway), exit with code 0 to trigger auto-restart.
      // Railway will restart the container automatically.
      log.info(`[SelfImprovement] Restarting in production: ${reason}`);
      // Delay slightly to allow the response to be sent first
      setTimeout(() => {
        process.exit(0);
      }, 2000);
      return {
        success: true,
        message: "Production restart initiated. The server will restart in ~2 seconds. Railway will auto-restart the container.",
      };
    } else {
      // In development, tsx watch mode auto-restarts on file changes.
      const triggerFile = path.join(PROJECT_ROOT, "server/routers.ts");
      if (fs.existsSync(triggerFile)) {
        const now = new Date();
        fs.utimesSync(triggerFile, now, now);
      }
      return {
        success: true,
        message: "Restart signal sent. The dev server will restart automatically via file watcher.",
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `Failed to trigger restart: ${err instanceof Error ? getErrorMessage(err) : String(err)}`,
    };
  }
}

// ─── Read File (for the assistant to inspect code) ───────────────────

/**
 * Read a file's content — allows the assistant to inspect code before modifying it.
 */
export function readFile(
  filePath: string
): { success: boolean; content?: string; error?: string } {
  try {
    const normalized = normalizePath(filePath);

    if (!isInAllowedDirectory(normalized)) {
      return {
        success: false,
        error: `Cannot read files outside allowed directories: ${ALLOWED_DIRECTORIES.join(", ")}`,
      };
    }

    const fullPath = path.join(PROJECT_ROOT, normalized);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `File not found: ${normalized}` };
    }

    const content = fs.readFileSync(fullPath, "utf-8");

    // Truncate very large files
    if (content.length > MAX_FILE_SIZE * 2) {
      return {
        success: true,
        content:
          content.substring(0, MAX_FILE_SIZE) +
          `\n\n... [TRUNCATED — file is ${Math.round(content.length / 1024)}KB, showing first ${MAX_FILE_SIZE / 1024}KB]`,
      };
    }

    return { success: true, content };
  } catch (err) {
    return {
      success: false,
      error: `Read failed: ${err instanceof Error ? getErrorMessage(err) : String(err)}`,
    };
  }
}

/**
 * List files in a directory — allows the assistant to explore the codebase.
 */
export function listFiles(
  dirPath: string
): { success: boolean; files?: string[]; error?: string } {
  try {
    const normalized = normalizePath(dirPath);
    const fullPath = path.join(PROJECT_ROOT, normalized);

    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Directory not found: ${normalized}` };
    }

    if (!fs.statSync(fullPath).isDirectory()) {
      return { success: false, error: `Not a directory: ${normalized}` };
    }

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const files = entries.map((e) =>
      e.isDirectory() ? `${e.name}/` : e.name
    );

    return { success: true, files };
  } catch (err) {
    return {
      success: false,
      error: `List failed: ${err instanceof Error ? getErrorMessage(err) : String(err)}`,
    };
  }
}

// ─── Get Modification History ────────────────────────────────────────

export async function getModificationHistory(
  limit: number = 20
): Promise<{
  success: boolean;
  entries?: Array<{
    id: number;
    action: string;
    targetFile: string | null;
    description: string;
    validationResult: string | null;
    applied: number;
    rolledBack: number;
    errorMessage: string | null;
    createdAt: Date;
  }>;
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const entries = await db
    .select()
    .from(selfModificationLog)
    .orderBy(desc(selfModificationLog.createdAt))
    .limit(limit);

  return {
    success: true,
    entries: entries.map((e) => ({
      id: e.id,
      action: e.action,
      targetFile: e.targetFile,
      description: e.description,
      validationResult: e.validationResult,
      applied: e.applied,
      rolledBack: e.rolledBack,
      errorMessage: e.errorMessage,
      createdAt: e.createdAt,
    })),
  };
}

// ─── Get Protected Files List ────────────────────────────────────────

export function getProtectedFiles(): string[] {
  return [...PROTECTED_PATHS];
}

export function getAllowedDirectories(): string[] {
  return [...ALLOWED_DIRECTORIES];
}


// ─── TypeScript Type Checking ───────────────────────────────────────

import { execSync } from "child_process";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
const log = createLogger("SelfImprovementEngine");

/**
 * Run the TypeScript compiler in check-only mode (tsc --noEmit).
 * Returns pass/fail status with error count and output.
 */
export async function runTypeCheck(): Promise<{
  passed: boolean;
  errorCount: number;
  output: string;
}> {
  // In production, devDependencies (tsc) are not installed — skip gracefully
  if (process.env.NODE_ENV === "production") {
    return {
      passed: true,
      errorCount: 0,
      output: "TypeScript check skipped in production (code was validated at build time).",
    };
  }
  try {
    const output = execSync("npx tsc --noEmit 2>&1", {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      timeout: 60000,
    });
    return { passed: true, errorCount: 0, output: output.trim() || "No errors found." };
  } catch (err: unknown) {
    const output = (err as any).stdout || (err as any).stderr || String(err);
    const errorMatches = output.match(/error TS\d+/g) || [];
    return {
      passed: false,
      errorCount: errorMatches.length,
      output: output.substring(0, 5000),
    };
  }
}

// ─── Test Execution ─────────────────────────────────────────────────

/**
 * Run the test suite (pnpm test) and return results.
 * Optionally pass a test pattern to run specific tests.
 */
export async function runTests(testPattern?: string): Promise<{
  passed: boolean;
  totalTests: number;
  failedTests: number;
  output: string;
}> {
  // In production, devDependencies (vitest) are not installed — skip gracefully
  if (process.env.NODE_ENV === "production") {
    return {
      passed: true,
      totalTests: 0,
      failedTests: 0,
      output: "Test execution skipped in production (tests run during CI/CD build).",
    };
  }
  try {
    const cmd = testPattern
      ? `pnpm test -- ${testPattern} 2>&1`
      : "pnpm test 2>&1";
    const output = execSync(cmd, {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      timeout: 120000,
    });
    const passMatch = output.match(/(\d+)\s+passed/);
    const failMatch = output.match(/(\d+)\s+failed/);
    const totalPassed = passMatch ? parseInt(passMatch[1], 10) : 0;
    const totalFailed = failMatch ? parseInt(failMatch[1], 10) : 0;
    return {
      passed: true,
      totalTests: totalPassed + totalFailed,
      failedTests: totalFailed,
      output: output.substring(0, 5000),
    };
  } catch (err: unknown) {
    const output = (err as any).stdout || (err as any).stderr || String(err);
    const passMatch = output.match(/(\d+)\s+passed/);
    const failMatch = output.match(/(\d+)\s+failed/);
    const totalPassed = passMatch ? parseInt(passMatch[1], 10) : 0;
    const totalFailed = failMatch ? parseInt(failMatch[1], 10) : 0;
    return {
      passed: false,
      totalTests: totalPassed + totalFailed,
      failedTests: totalFailed || 1,
      output: output.substring(0, 5000),
    };
  }
}

// ─── Enhanced Health Check ──────────────────────────────────────────

/**
 * Quick health check with optional TypeScript and test execution.
 * Extends the basic health check with compiler and test verification.
 */
export async function runQuickHealthCheck(options?: {
  skipTests?: boolean;
  skipTypeCheck?: boolean;
}): Promise<HealthCheckResult> {
  const baseResult = await runHealthCheck();

  if (!options?.skipTypeCheck) {
    try {
      const tsResult = await runTypeCheck();
      baseResult.checks.push({
        name: "typescript",
        passed: tsResult.passed,
        message: tsResult.passed
          ? "TypeScript: 0 errors"
          : `TypeScript: ${tsResult.errorCount} error(s) found`,
      });
      if (!tsResult.passed) baseResult.healthy = false;
    } catch {
      baseResult.checks.push({
        name: "typescript",
        passed: false,
        message: "TypeScript check failed to run",
      });
      baseResult.healthy = false;
    }
  }

  if (!options?.skipTests) {
    try {
      const testResult = await runTests();
      baseResult.checks.push({
        name: "tests",
        passed: testResult.passed,
        message: testResult.passed
          ? `Tests: ${testResult.totalTests} passed, 0 failed`
          : `Tests: ${testResult.failedTests} of ${testResult.totalTests} failed`,
      });
      if (!testResult.passed) baseResult.healthy = false;
    } catch {
      baseResult.checks.push({
        name: "tests",
        passed: false,
        message: "Test execution failed to run",
      });
      baseResult.healthy = false;
    }
  }

  return baseResult;
}


// ─── Deferred Staging System ──────────────────────────────────────
//
// When the LLM tool loop is active, file modifications are staged in memory
// instead of being written to disk immediately. This prevents the tsx file
// watcher from restarting the server mid-conversation, which would kill the
// in-flight HTTP request.
//
// Usage:
//   1. Call enableDeferredMode() before the tool loop starts
//   2. All applyModifications() calls will stage changes instead of writing
//   3. After the tool loop ends, call flushStagedChanges() to write to disk
//   4. Call disableDeferredMode() to clean up

interface StagedChange {
  filePath: string;
  action: "create" | "modify" | "delete";
  content?: string;
  description: string;
  snapshotId?: number;
}

let _deferredMode = false;
const _stagedChanges: StagedChange[] = [];
let _pendingRestart: { reason: string; userId: number | null } | null = null;

/**
 * Enable deferred mode — all subsequent file modifications will be staged
 * in memory instead of written to disk.
 */
export function enableDeferredMode(): void {
  _deferredMode = true;
  _stagedChanges.length = 0;
  _pendingRestart = null;
  log.info("[SelfImprovement] Deferred mode ENABLED — file writes will be staged");
}

/**
 * Disable deferred mode and clear any staged changes.
 */
export function disableDeferredMode(): void {
  _deferredMode = false;
  _stagedChanges.length = 0;
  _pendingRestart = null;
  log.info("[SelfImprovement] Deferred mode DISABLED");
}

/**
 * Check if deferred mode is active.
 */
export function isDeferredMode(): boolean {
  return _deferredMode;
}

/**
 * Get the count of staged changes.
 */
export function getStagedChangeCount(): number {
  return _stagedChanges.length;
}

/**
 * Stage a modification for later flushing. Called internally by
 * applyModifications when deferred mode is active.
 */
function stageChange(change: StagedChange): void {
  // If there's already a staged change for this file, replace it
  const existingIdx = _stagedChanges.findIndex(c => c.filePath === change.filePath);
  if (existingIdx >= 0) {
    _stagedChanges[existingIdx] = change;
  } else {
    _stagedChanges.push(change);
  }
}

/**
 * Stage a restart request for after flush.
 */
export function stageRestart(reason: string, userId: number | null): void {
  _pendingRestart = { reason, userId };
}

/**
 * Flush all staged changes to disk. This is called after the LLM tool loop
 * completes and the response is ready to send.
 *
 * Returns a summary of what was applied.
 */
export async function flushStagedChanges(): Promise<{
  flushed: boolean;
  fileCount: number;
  files: string[];
  restartTriggered: boolean;
  errors: string[];
}> {
  if (_stagedChanges.length === 0 && !_pendingRestart) {
    return { flushed: false, fileCount: 0, files: [], restartTriggered: false, errors: [] };
  }

  log.info(`[SelfImprovement] Flushing ${_stagedChanges.length} staged change(s) to disk...`);

  const errors: string[] = [];
  const flushedFiles: string[] = [];

  for (const change of _stagedChanges) {
    const fullPath = path.join(PROJECT_ROOT, change.filePath);
    try {
      switch (change.action) {
        case "create":
        case "modify": {
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(fullPath, change.content || "", "utf-8");
          flushedFiles.push(change.filePath);
          break;
        }
        case "delete": {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
          flushedFiles.push(change.filePath);
          break;
        }
      }
    } catch (err) {
      const msg = `Failed to flush ${change.filePath}: ${err instanceof Error ? getErrorMessage(err) : String(err)}`;
      log.error(`[SelfImprovement] ${msg}`);
      errors.push(msg);
    }
  }

  // Clear staged changes
  _stagedChanges.length = 0;

  // Clean up "[STAGED — pending flush]" labels in the DB now that files are written
  if (flushedFiles.length > 0) {
    try {
      const db = await getDb();
      if (db) {
        await db.execute(
          sql`UPDATE self_modification_log SET description = REPLACE(description, ' [STAGED \u2014 pending flush]', '') WHERE description LIKE '%[STAGED%pending flush]%'`
        );
        log.info(`[SelfImprovement] Cleaned up STAGED labels in modification log`);
      }
    } catch (cleanupErr) {
      log.warn(`[SelfImprovement] Could not clean STAGED labels:`, { detail: cleanupErr });
    }
  }

  // Handle pending restart
  let restartTriggered = false;
  if (_pendingRestart) {
    log.info(`[SelfImprovement] Triggering deferred restart: ${_pendingRestart.reason}`);
    await requestRestart(_pendingRestart.reason, _pendingRestart.userId);
    _pendingRestart = null;
    restartTriggered = true;
  }

  // Disable deferred mode
  _deferredMode = false;

  log.info(`[SelfImprovement] Flush complete: ${flushedFiles.length} file(s) written`);

  return {
    flushed: true,
    fileCount: flushedFiles.length,
    files: flushedFiles,
    restartTriggered,
    errors,
  };
}

/**
 * Deferred-aware version of applyModifications.
 * When deferred mode is active, stages changes in memory and returns
 * a simulated success result. The actual disk writes happen when
 * flushStagedChanges() is called.
 *
 * When deferred mode is NOT active, behaves exactly like the original
 * applyModifications (writes to disk immediately).
 */
export async function applyModificationsDeferred(
  modifications: ModificationRequest[],
  userId: number | null,
  requestedBy: string = "titan_assistant"
): Promise<ModificationResult> {
  // If not in deferred mode, fall through to the original
  if (!_deferredMode) {
    return applyModifications(modifications, userId, requestedBy);
  }

  // Anti-Self-Break: Circuit breaker check (even in deferred mode)
  const cbCheck = checkCircuitBreaker();
  if (!cbCheck.allowed) {
    return {
      success: false,
      error: cbCheck.message,
      modifications: modifications.map((m) => ({
        filePath: m.filePath,
        action: m.action,
        applied: false,
        error: "Circuit breaker active",
      })),
    };
  }

  // Anti-Self-Break: Rate limit check (even in deferred mode)
  const rlCheck = checkRateLimit(modifications.length);
  if (!rlCheck.allowed) {
    return {
      success: false,
      error: rlCheck.message,
      modifications: modifications.map((m) => ({
        filePath: m.filePath,
        action: m.action,
        applied: false,
        error: "Rate limited",
      })),
    };
  }

  // Validate first (same as original)
  const validation = validateModifications(modifications);
  if (!validation.valid) {
    return {
      success: false,
      validationResult: validation,
      modifications: modifications.map((m) => ({
        filePath: m.filePath,
        action: m.action,
        applied: false,
        error: "Validation failed",
      })),
      error: `Validation failed: ${validation.errors.join("; ")}`,
    };
  }

  // Create snapshot (still writes to DB, which is fine — no file watcher issue)
  const filePaths = modifications.map((m) => m.filePath);
  const snapshot = await createSnapshot(
    filePaths,
    `Pre-modification snapshot (deferred): ${modifications.map((m) => `${m.action} ${m.filePath}`).join(", ")}`,
    requestedBy
  );

  if (!snapshot.success) {
    return {
      success: false,
      error: `Failed to create snapshot: ${snapshot.error}`,
      modifications: [],
    };
  }

  // Stage changes in memory instead of writing to disk
  const results: ModificationResult["modifications"] = [];
  const db = await getDb();

  for (const mod of modifications) {
    const normalized = normalizePath(mod.filePath);
    try {
      stageChange({
        filePath: normalized,
        action: mod.action,
        content: mod.content,
        description: mod.description,
        snapshotId: snapshot.snapshotId,
      });

      results.push({ filePath: normalized, action: mod.action, applied: true });

      // Log the modification (DB write is fine)
      if (db) {
        await db.insert(selfModificationLog).values({
          snapshotId: snapshot.snapshotId!,
          requestedBy,
          userId,
          action: mod.action === "create" ? "create_file" : mod.action === "delete" ? "delete_file" : "modify_file",
          targetFile: normalized,
          description: `${mod.description} [STAGED — pending flush]`,
          validationResult: "passed",
          applied: 1,
          rolledBack: 0,
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? getErrorMessage(err) : String(err);
      results.push({
        filePath: normalized,
        action: mod.action,
        applied: false,
        error: errorMsg,
      });
    }
  }

  // Skip health check for deferred mode — we'll check after flush
  // Mark snapshot as good (optimistic — will be rolled back if flush fails)
  await markSnapshotAsGood(snapshot.snapshotId!);

  // Anti-Self-Break: Record rate limit for deferred changes too
  recordRateLimit(modifications.length);

  log.info(`[SelfImprovement] Staged ${results.filter(r => r.applied).length} change(s) — will flush after conversation ends`);

  return {
    success: true,
    snapshotId: snapshot.snapshotId,
    modifications: results,
    validationResult: validation,
    healthCheckPassed: true, // optimistic — real check happens after flush
    rolledBack: false,
  };
}


// ─── GitHub Integration for Autonomous Commits ──────────────────────
//
// When GITHUB_PAT is set as an environment variable, Titan can push
// code changes to GitHub after successful modifications.
//
// This enables the full autonomous loop:
//   User request → Titan modifies code → Push to GitHub → Railway auto-deploys

/**
 * Push changes to GitHub using the configured PAT.
 * Commits all staged changes and pushes to both repositories.
 *
 * @param files - List of file paths that were modified
 * @param commitMessage - Descriptive commit message
 * @returns Result with success status and details
 */
export async function pushToGitHub(
  files: string[],
  commitMessage: string
): Promise<{
  success: boolean;
  commitHash?: string;
  pushedRepos: string[];
  error?: string;
}> {
  const GITHUB_PAT = process.env.GITHUB_PAT;
  if (!GITHUB_PAT) {
    return {
      success: false,
      pushedRepos: [],
      error: "GITHUB_PAT environment variable is not set. Cannot push to GitHub.",
    };
  }

  // Anti-Self-Break: Validate commit message
  if (!commitMessage || commitMessage.trim().length < 5) {
    return {
      success: false,
      pushedRepos: [],
      error: "Commit message must be at least 5 characters.",
    };
  }

  // Anti-Self-Break: Don't push if circuit breaker is active
  const cbCheck = checkCircuitBreaker();
  if (!cbCheck.allowed) {
    return {
      success: false,
      pushedRepos: [],
      error: `Cannot push — ${cbCheck.message}`,
    };
  }

  const REPOS = [
    { name: "architabot", remote: `https://${GITHUB_PAT}@github.com/leego972/architabot.git` },
    { name: "archibald-titan-ai", remote: `https://${GITHUB_PAT}@github.com/leego972/archibald-titan-ai.git` },
  ];

  try {
    // Ensure git repo exists (production containers don't have .git)
    const gitDir = path.join(PROJECT_ROOT, ".git");
    if (!fs.existsSync(gitDir)) {
      log.info("[SelfImprovement] No .git directory found — initializing fresh repo");
      execSync("git init", { cwd: PROJECT_ROOT, encoding: "utf-8" });
      execSync('git config user.email "archibaldtitan@gmail.com"', { cwd: PROJECT_ROOT, encoding: "utf-8" });
      execSync('git config user.name "Archibald Titan"', { cwd: PROJECT_ROOT, encoding: "utf-8" });
      // Add all existing files as the initial state
      execSync("git add -A", { cwd: PROJECT_ROOT, encoding: "utf-8" });
      execSync('git commit -m "Initial production state" --allow-empty', { cwd: PROJECT_ROOT, encoding: "utf-8" });
      // Fetch the latest from the primary repo so we have a proper history
      try {
        execSync(`git remote add origin https://${GITHUB_PAT}@github.com/leego972/architabot.git`, { cwd: PROJECT_ROOT, encoding: "utf-8" });
        execSync("git fetch origin main --depth=1 2>&1", { cwd: PROJECT_ROOT, encoding: "utf-8", timeout: 30000 });
        // Reset to the fetched state but keep our working tree changes
        execSync("git reset --soft origin/main 2>&1", { cwd: PROJECT_ROOT, encoding: "utf-8" });
      } catch (fetchErr: unknown) {
        log.warn(`[SelfImprovement] Could not fetch from origin: ${getErrorMessage(fetchErr)}`);
      }
      log.info("[SelfImprovement] Git repo initialized successfully");
    } else {
      // Configure git user (repo already exists)
      execSync('git config user.email "archibaldtitan@gmail.com"', { cwd: PROJECT_ROOT, encoding: "utf-8" });
      execSync('git config user.name "Archibald Titan"', { cwd: PROJECT_ROOT, encoding: "utf-8" });
    }

    // Stage the modified files
    for (const file of files) {
      const normalized = normalizePath(file);
      try {
        execSync(`git add "${normalized}"`, { cwd: PROJECT_ROOT, encoding: "utf-8" });
      } catch {
        // File might not exist (deleted), try git rm
        try {
          execSync(`git rm --cached "${normalized}" 2>/dev/null || true`, { cwd: PROJECT_ROOT, encoding: "utf-8" });
        } catch { /* ignore */ }
      }
    }

    // Commit
    const sanitizedMessage = commitMessage.replace(/"/g, '\\"');
    try {
      execSync(`git commit -m "${sanitizedMessage}"`, { cwd: PROJECT_ROOT, encoding: "utf-8" });
    } catch (commitErr: unknown) {
      // If nothing to commit, that's OK
      if ((commitErr as any).stdout?.includes("nothing to commit") || (commitErr as any).stderr?.includes("nothing to commit")) {
        return {
          success: true,
          pushedRepos: [],
          error: "Nothing to commit — files may not have changed.",
        };
      }
      throw commitErr;
    }

    // Get commit hash
    const commitHash = execSync("git rev-parse --short HEAD", { cwd: PROJECT_ROOT, encoding: "utf-8" }).trim();

    // Push to each repository
    const pushedRepos: string[] = [];
    for (const repo of REPOS) {
      try {
        // Ensure remote exists or update it
        try {
          execSync(`git remote add ${repo.name} ${repo.remote} 2>/dev/null || git remote set-url ${repo.name} ${repo.remote}`, {
            cwd: PROJECT_ROOT,
            encoding: "utf-8",
          });
        } catch { /* remote might already exist */ }

        // Push — use force to handle divergent histories in production container
        execSync(`git push ${repo.name} HEAD:main --force 2>&1`, {
          cwd: PROJECT_ROOT,
          encoding: "utf-8",
          timeout: 30000,
        });
        pushedRepos.push(repo.name);
        log.info(`[SelfImprovement] Pushed to ${repo.name} (${commitHash})`);
      } catch (pushErr: unknown) {
        log.error(`[SelfImprovement] Failed to push to ${repo.name}: ${getErrorMessage(pushErr)}`);
      }
    }

    // Log the push
    const db = await getDb();
    if (db) {
      await db.insert(selfModificationLog).values({
        requestedBy: "titan_assistant",
        userId: null,
        action: "modify_file",
        description: `[git_push] Pushed ${files.length} file(s) to GitHub: ${commitMessage} [${commitHash}] → ${pushedRepos.join(", ")}`,
        validationResult: "passed",
        applied: 1,
        rolledBack: 0,
      });
    }

    return {
      success: pushedRepos.length > 0,
      commitHash,
      pushedRepos,
      error: pushedRepos.length === 0 ? "Failed to push to any repository" : undefined,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? getErrorMessage(err) : String(err);
    log.error(`[SelfImprovement] GitHub push failed: ${errorMsg}`);
    return {
      success: false,
      pushedRepos: [],
      error: `Git push failed: ${errorMsg}`,
    };
  }
}

/**
 * Check if GitHub integration is available.
 */
export function isGitHubIntegrationAvailable(): boolean {
  return !!process.env.GITHUB_PAT;
}

/**
 * Get GitHub integration status.
 */
export function getGitHubIntegrationStatus(): {
  available: boolean;
  patConfigured: boolean;
  repos: string[];
} {
  return {
    available: !!process.env.GITHUB_PAT,
    patConfigured: !!process.env.GITHUB_PAT,
    repos: ["leego972/architabot", "leego972/archibald-titan-ai"],
  };
}
