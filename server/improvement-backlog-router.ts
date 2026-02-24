import { z } from "zod";
import { adminProcedure, protectedProcedure } from "./_core/trpc";
import { router } from "./_core/trpc";
import { getDb } from "./db";
import { TRPCError } from "@trpc/server";
import { desc, eq, sql, and } from "drizzle-orm";
import { improvementTasks } from "../drizzle/schema";
import { createLogger } from "./_core/logger.js";
const log = createLogger("ImprovementBacklogRouter");

// ─── Curated Improvement Task Seed Data ──────────────────────────────
// These are the improvements Titan should work on to improve itself.

export const SEED_IMPROVEMENT_TASKS = [
  // ── Performance ──
  {
    title: "Implement response caching for frequently accessed API endpoints",
    description: "Add Redis-compatible in-memory caching (node-cache or lru-cache) for hot endpoints like list_credentials, list_providers, and get_system_status. Cache invalidation on writes. Target: reduce p95 latency by 40%.",
    category: "performance" as const,
    priority: "high" as const,
    complexity: "medium" as const,
    estimatedFiles: 3,
  },
  {
    title: "Optimize database queries with proper indexing",
    description: "Audit all Drizzle queries for missing indexes. Add composite indexes on (userId, createdAt) for fetcher_jobs, audit_logs, chat_messages. Add index on (status) for fetcher_tasks. Benchmark before/after.",
    category: "performance" as const,
    priority: "high" as const,
    complexity: "medium" as const,
    estimatedFiles: 2,
  },
  {
    title: "Implement lazy loading for dashboard widgets",
    description: "Dashboard loads all widgets simultaneously causing slow initial render. Implement React.lazy() + Suspense for each widget component. Load above-fold widgets first, defer below-fold. Add skeleton loaders.",
    category: "performance" as const,
    priority: "medium" as const,
    complexity: "small" as const,
    estimatedFiles: 4,
  },
  {
    title: "Add connection pooling for database connections",
    description: "Current DB connection pattern creates new connections per request. Implement connection pooling with configurable pool size (min: 2, max: 10). Add connection health checks and automatic reconnection.",
    category: "performance" as const,
    priority: "medium" as const,
    complexity: "medium" as const,
    estimatedFiles: 2,
  },
  // ── Security ──
  {
    title: "Implement Content Security Policy (CSP) headers",
    description: "Add strict CSP headers to all responses: default-src 'self', script-src with nonces, style-src 'self' 'unsafe-inline' (for Tailwind), img-src 'self' data: https:, connect-src 'self'. Block inline scripts and eval.",
    category: "security" as const,
    priority: "critical" as const,
    complexity: "small" as const,
    estimatedFiles: 2,
  },
  {
    title: "Add request rate limiting per endpoint",
    description: "Implement tiered rate limiting: auth endpoints (5/min), API endpoints (based on plan), webhook endpoints (100/min). Use sliding window algorithm. Return Retry-After header on 429. Store counters in memory with TTL.",
    category: "security" as const,
    priority: "high" as const,
    complexity: "medium" as const,
    estimatedFiles: 3,
  },
  {
    title: "Implement CSRF protection for all mutation endpoints",
    description: "Add CSRF token generation and validation. Generate token on session creation, embed in meta tag, validate on all POST/PUT/DELETE requests. Exempt webhook endpoints and API key-authenticated requests.",
    category: "security" as const,
    priority: "high" as const,
    complexity: "medium" as const,
    estimatedFiles: 4,
  },
  {
    title: "Add input sanitization middleware for all user inputs",
    description: "Create middleware that sanitizes all string inputs: strip HTML tags (except in markdown fields), normalize Unicode, prevent null bytes, limit string lengths. Apply to all tRPC procedures via middleware.",
    category: "security" as const,
    priority: "medium" as const,
    complexity: "small" as const,
    estimatedFiles: 2,
  },
  {
    title: "Implement API key rotation with grace period",
    description: "Allow users to rotate API keys with a configurable grace period (default 24h) where both old and new keys work. Auto-revoke old key after grace period. Send notification email on rotation.",
    category: "security" as const,
    priority: "medium" as const,
    complexity: "medium" as const,
    estimatedFiles: 3,
  },
  // ── UX ──
  {
    title: "Add keyboard shortcuts for power users",
    description: "Implement global keyboard shortcuts: Ctrl+K for command palette, Ctrl+/ for help, Ctrl+N for new fetch job, Ctrl+E for export, Escape to close modals. Show shortcut hints in tooltips. Add shortcuts reference modal.",
    category: "ux" as const,
    priority: "medium" as const,
    complexity: "medium" as const,
    estimatedFiles: 4,
  },
  {
    title: "Implement real-time job progress with WebSocket",
    description: "Replace polling-based job status updates with WebSocket connection. Show live progress bar, real-time log streaming, and instant completion notifications. Fallback to polling if WebSocket fails.",
    category: "ux" as const,
    priority: "high" as const,
    complexity: "large" as const,
    estimatedFiles: 6,
  },
  {
    title: "Add command palette (Ctrl+K) for quick navigation",
    description: "Build a command palette component (like VS Code / Linear) that allows quick navigation to any page, running common actions (new job, export, scan), and searching credentials. Fuzzy search with keyboard navigation.",
    category: "ux" as const,
    priority: "medium" as const,
    complexity: "medium" as const,
    estimatedFiles: 3,
  },
  {
    title: "Improve error messages with actionable suggestions",
    description: "Audit all error toasts and error states. Replace generic 'Something went wrong' with specific messages that tell the user what happened and what to do. Add 'Try Again' buttons where applicable. Log errors to audit trail.",
    category: "ux" as const,
    priority: "medium" as const,
    complexity: "medium" as const,
    estimatedFiles: 8,
  },
  {
    title: "Add data export in multiple formats (PDF report, Excel)",
    description: "Extend export system beyond JSON/ENV/CSV. Add PDF report generation (credential summary with metadata, charts). Add Excel export with formatted sheets per provider. Use jsPDF and xlsx libraries.",
    category: "ux" as const,
    priority: "low" as const,
    complexity: "medium" as const,
    estimatedFiles: 3,
  },
  // ── Feature ──
  {
    title: "Build notification center with in-app alerts",
    description: "Create a notification system: bell icon in header with unread count, dropdown panel with notification list, mark as read/unread, notification preferences. Trigger on: job complete, credential expiring, leak found, team invite.",
    category: "feature" as const,
    priority: "high" as const,
    complexity: "large" as const,
    estimatedFiles: 6,
  },
  {
    title: "Add credential tagging and folder organization",
    description: "Allow users to tag credentials with custom labels (e.g., 'production', 'staging', 'personal'). Add folder/group view. Filter credentials by tag. Bulk tag operations. Tag-based export.",
    category: "feature" as const,
    priority: "medium" as const,
    complexity: "medium" as const,
    estimatedFiles: 5,
  },
  {
    title: "Implement credential sharing with expiring links",
    description: "Generate time-limited, encrypted sharing links for individual credentials. Options: view-once, 1h, 24h, 7d expiry. Password protection optional. Audit log all shares. Revoke active shares.",
    category: "feature" as const,
    priority: "medium" as const,
    complexity: "medium" as const,
    estimatedFiles: 4,
  },
  {
    title: "Build provider status page showing real-time availability",
    description: "Create a public-facing status page showing each provider's current availability (up/degraded/down), response times, and incident history. Auto-detect outages from failed fetch jobs. RSS feed for status updates.",
    category: "feature" as const,
    priority: "low" as const,
    complexity: "large" as const,
    estimatedFiles: 5,
  },
  {
    title: "Add multi-language support (i18n)",
    description: "Implement internationalization using react-i18next. Extract all user-facing strings to translation files. Start with English (default) and add Spanish, French, German, Japanese. Language selector in settings.",
    category: "feature" as const,
    priority: "low" as const,
    complexity: "epic" as const,
    estimatedFiles: 20,
  },
  // ── Reliability ──
  {
    title: "Add automatic retry with exponential backoff for failed fetches",
    description: "When a fetch job fails due to transient errors (network timeout, rate limit, temporary CAPTCHA), automatically retry up to 3 times with exponential backoff (1s, 4s, 16s). Log each retry attempt. Mark as failed only after all retries exhausted.",
    category: "reliability" as const,
    priority: "critical" as const,
    complexity: "medium" as const,
    estimatedFiles: 3,
  },
  {
    title: "Implement graceful shutdown with job persistence",
    description: "On SIGTERM/SIGINT, stop accepting new jobs, wait for running jobs to complete (30s timeout), save incomplete job state to DB for resume on restart. Add startup recovery that resumes interrupted jobs.",
    category: "reliability" as const,
    priority: "high" as const,
    complexity: "medium" as const,
    estimatedFiles: 3,
  },
  {
    title: "Add health check endpoint with dependency monitoring",
    description: "Create /api/health endpoint that checks: database connectivity, S3 access, LLM API availability, memory usage, uptime. Return structured JSON with status per dependency. Add /api/health/ready for k8s readiness probe.",
    category: "reliability" as const,
    priority: "high" as const,
    complexity: "small" as const,
    estimatedFiles: 2,
  },
  {
    title: "Implement dead letter queue for failed webhook deliveries",
    description: "When webhook delivery fails after 3 retries, move to dead letter queue instead of discarding. Admin UI to view, retry, or purge dead letters. Auto-disable webhooks after 50 consecutive failures with email notification.",
    category: "reliability" as const,
    priority: "medium" as const,
    complexity: "medium" as const,
    estimatedFiles: 4,
  },
  // ── Testing ──
  {
    title: "Add integration tests for the complete fetch job lifecycle",
    description: "Write end-to-end tests that cover: create job → queue → execute → extract credentials → store encrypted → export. Mock browser engine but test the full pipeline. Cover success, failure, and partial completion scenarios.",
    category: "testing" as const,
    priority: "high" as const,
    complexity: "large" as const,
    estimatedFiles: 3,
  },
  {
    title: "Add load testing suite for API endpoints",
    description: "Create k6 or artillery load test scripts for critical endpoints: login, create job, list credentials, export. Define SLOs: p99 < 500ms, error rate < 0.1%. Run against staging before releases. Generate HTML report.",
    category: "testing" as const,
    priority: "medium" as const,
    complexity: "medium" as const,
    estimatedFiles: 3,
  },
  {
    title: "Implement visual regression testing for UI components",
    description: "Set up Playwright visual comparison tests for key pages: landing, dashboard, pricing, chat. Capture baseline screenshots, compare on changes. Flag visual regressions in CI. Threshold: 0.1% pixel difference.",
    category: "testing" as const,
    priority: "low" as const,
    complexity: "medium" as const,
    estimatedFiles: 4,
  },
  // ── Infrastructure ──
  {
    title: "Add structured logging with log levels and correlation IDs",
    description: "Replace console.log with structured logger (pino or winston). Add log levels (debug, info, warn, error). Generate correlation ID per request and propagate through all operations. Format: JSON with timestamp, level, correlationId, message, context.",
    category: "infrastructure" as const,
    priority: "high" as const,
    complexity: "medium" as const,
    estimatedFiles: 5,
  },
  {
    title: "Implement database migration versioning with rollback support",
    description: "Add migration version tracking beyond Drizzle's built-in. Record migration hash, execution time, and status. Support manual rollback to specific version. Add pre-migration backup. Block deployment if migration fails.",
    category: "infrastructure" as const,
    priority: "medium" as const,
    complexity: "medium" as const,
    estimatedFiles: 3,
  },
  {
    title: "Add OpenTelemetry tracing for request lifecycle visibility",
    description: "Instrument Express middleware, tRPC procedures, and database queries with OpenTelemetry spans. Export traces to console in dev, to collector in prod. Add trace ID to error responses for debugging.",
    category: "infrastructure" as const,
    priority: "low" as const,
    complexity: "large" as const,
    estimatedFiles: 4,
  },
  {
    title: "Implement automated backup system for critical data",
    description: "Build scheduled backup job that exports: all credentials (encrypted), user data, team configurations, API keys, and webhook configs to S3. Daily full backup, hourly incremental. Retention: 30 days. Add restore endpoint (admin only).",
    category: "infrastructure" as const,
    priority: "high" as const,
    complexity: "large" as const,
    estimatedFiles: 4,
  },
];

// ─── Router ──────────────────────────────────────────────────────────

export const improvementBacklogRouter = router({
  /** List all improvement tasks with optional filters */
  list: protectedProcedure
    .input(
      z.object({
        category: z.enum(["performance", "security", "ux", "feature", "reliability", "testing", "infrastructure"]).optional(),
        status: z.enum(["pending", "in_progress", "completed", "failed", "skipped"]).optional(),
        priority: z.enum(["critical", "high", "medium", "low"]).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input?.category) conditions.push(eq(improvementTasks.category, input.category));
      if (input?.status) conditions.push(eq(improvementTasks.status, input.status));
      if (input?.priority) conditions.push(eq(improvementTasks.priority, input.priority));
      const rows = await db
        .select()
        .from(improvementTasks)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(
          sql`FIELD(${improvementTasks.priority}, 'critical', 'high', 'medium', 'low')`,
          desc(improvementTasks.createdAt)
        );
      return rows;
    }),

  /** Get stats overview */
  stats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, pending: 0, inProgress: 0, completed: 0, failed: 0, skipped: 0, byCategory: {}, byPriority: {} };
    const [total] = await db.select({ count: sql<number>`count(*)` }).from(improvementTasks);
    const [pending] = await db.select({ count: sql<number>`count(*)` }).from(improvementTasks).where(eq(improvementTasks.status, "pending"));
    const [inProgress] = await db.select({ count: sql<number>`count(*)` }).from(improvementTasks).where(eq(improvementTasks.status, "in_progress"));
    const [completed] = await db.select({ count: sql<number>`count(*)` }).from(improvementTasks).where(eq(improvementTasks.status, "completed"));
    const [failed] = await db.select({ count: sql<number>`count(*)` }).from(improvementTasks).where(eq(improvementTasks.status, "failed"));
    const [skipped] = await db.select({ count: sql<number>`count(*)` }).from(improvementTasks).where(eq(improvementTasks.status, "skipped"));
    const categoryRows = await db
      .select({ category: improvementTasks.category, count: sql<number>`count(*)` })
      .from(improvementTasks)
      .groupBy(improvementTasks.category);
    const priorityRows = await db
      .select({ priority: improvementTasks.priority, count: sql<number>`count(*)` })
      .from(improvementTasks)
      .groupBy(improvementTasks.priority);
    const byCategory: Record<string, number> = {};
    categoryRows.forEach((r) => { byCategory[r.category] = r.count; });
    const byPriority: Record<string, number> = {};
    priorityRows.forEach((r) => { byPriority[r.priority] = r.count; });
    return {
      total: total.count,
      pending: pending.count,
      inProgress: inProgress.count,
      completed: completed.count,
      failed: failed.count,
      skipped: skipped.count,
      byCategory,
      byPriority,
    };
  }),

  /** Seed the backlog with curated tasks (admin only, idempotent) */
  seed: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    // Check if already seeded
    const [existing] = await db.select({ count: sql<number>`count(*)` }).from(improvementTasks);
    if (existing.count > 0) {
      return { seeded: false, message: `Backlog already has ${existing.count} tasks`, count: existing.count };
    }
    // Insert all seed tasks
    for (const task of SEED_IMPROVEMENT_TASKS) {
      await db.insert(improvementTasks).values({
        title: task.title,
        description: task.description,
        category: task.category,
        priority: task.priority,
        complexity: task.complexity,
        estimatedFiles: task.estimatedFiles,
        assignedBy: "system",
      });
    }
    return { seeded: true, message: `Seeded ${SEED_IMPROVEMENT_TASKS.length} improvement tasks`, count: SEED_IMPROVEMENT_TASKS.length };
  }),

  /** Add a new task (admin only) */
  add: adminProcedure
    .input(
      z.object({
        title: z.string().min(5).max(256),
        description: z.string().min(10),
        category: z.enum(["performance", "security", "ux", "feature", "reliability", "testing", "infrastructure"]),
        priority: z.enum(["critical", "high", "medium", "low"]),
        complexity: z.enum(["trivial", "small", "medium", "large", "epic"]),
        estimatedFiles: z.number().int().min(1).max(50).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [result] = await db.insert(improvementTasks).values({
        ...input,
        estimatedFiles: input.estimatedFiles ?? 1,
        assignedBy: "admin",
      });
      return { id: result.insertId, message: "Task added" };
    }),

  /** Update task status (admin only) */
  updateStatus: adminProcedure
    .input(
      z.object({
        id: z.number().int(),
        status: z.enum(["pending", "in_progress", "completed", "failed", "skipped"]),
        completionNotes: z.string().optional(),
        snapshotId: z.number().int().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const updates: Record<string, unknown> = { status: input.status };
      if (input.status === "completed") updates.completedAt = new Date();
      if (input.completionNotes) updates.completionNotes = input.completionNotes;
      if (input.snapshotId) updates.snapshotId = input.snapshotId;
      await db.update(improvementTasks).set(updates).where(eq(improvementTasks.id, input.id));
      return { message: "Task updated" };
    }),

  /** Delete a task (admin only) */
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.delete(improvementTasks).where(eq(improvementTasks.id, input.id));
      return { message: "Task deleted" };
    }),
});
