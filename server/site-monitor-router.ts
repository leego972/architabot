/**
 * Site Monitor Router — Website health monitoring, incident tracking, and auto-repair.
 *
 * Allows users to register their websites, configure health checks,
 * track uptime/performance, detect incidents, and trigger auto-repairs
 * via API, SSH, or platform-specific integrations.
 *
 * Tier Access:
 *   Pro:        Up to 3 sites, 5-min intervals, basic repair
 *   Enterprise: Up to 10 sites, 1-min intervals, full repair
 *   Cyber+:     Up to 10 sites, 1-min intervals, full repair + security checks
 *   Titan:      Unlimited sites, 30-sec intervals, priority repair queue
 */
import { z } from "zod";
import { eq, and, desc, sql, gte, lte, count, avg } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  monitoredSites,
  healthChecks,
  siteIncidents,
  repairLogs,
} from "../drizzle/schema";
import { getUserPlan } from "./subscription-gate";
import { logAudit } from "./audit-log-db";
import type { PlanId } from "../shared/pricing";

// ─── Plan Limits ───────────────────────────────────────────────────

interface MonitorLimits {
  maxSites: number;
  minIntervalSeconds: number;
  autoRepairEnabled: boolean;
  sslCheckEnabled: boolean;
  performanceMetrics: boolean;
  maxCheckHistoryDays: number;
}

function getMonitorLimits(planId: PlanId): MonitorLimits {
  switch (planId) {
    case "pro":
      return {
        maxSites: 3,
        minIntervalSeconds: 300,
        autoRepairEnabled: true,
        sslCheckEnabled: true,
        performanceMetrics: false,
        maxCheckHistoryDays: 7,
      };
    case "enterprise":
      return {
        maxSites: 10,
        minIntervalSeconds: 60,
        autoRepairEnabled: true,
        sslCheckEnabled: true,
        performanceMetrics: true,
        maxCheckHistoryDays: 30,
      };
    case "cyber":
      return {
        maxSites: 10,
        minIntervalSeconds: 60,
        autoRepairEnabled: true,
        sslCheckEnabled: true,
        performanceMetrics: true,
        maxCheckHistoryDays: 30,
      };
    case "cyber_plus":
      return {
        maxSites: 10,
        minIntervalSeconds: 60,
        autoRepairEnabled: true,
        sslCheckEnabled: true,
        performanceMetrics: true,
        maxCheckHistoryDays: 90,
      };
    case "titan":
      return {
        maxSites: -1, // unlimited
        minIntervalSeconds: 30,
        autoRepairEnabled: true,
        sslCheckEnabled: true,
        performanceMetrics: true,
        maxCheckHistoryDays: 365,
      };
    default:
      return {
        maxSites: 0,
        minIntervalSeconds: 300,
        autoRepairEnabled: false,
        sslCheckEnabled: false,
        performanceMetrics: false,
        maxCheckHistoryDays: 0,
      };
  }
}

const ALLOWED_PLANS: PlanId[] = ["pro", "enterprise", "cyber", "cyber_plus", "titan"];

function enforceMonitorAccess(planId: PlanId): void {
  if (!ALLOWED_PLANS.includes(planId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Website Health Monitor requires a Pro plan or higher. Upgrade to unlock this feature.",
    });
  }
}

// ─── Validation Schemas ────────────────────────────────────────────

const addSiteSchema = z.object({
  name: z.string().min(1).max(256),
  url: z.string().url().max(2048),
  checkIntervalSeconds: z.number().int().min(30).max(86400).optional(),
  accessMethod: z.enum([
    "none", "api", "ssh", "ftp", "login", "webhook",
    "railway", "vercel", "netlify", "render", "heroku",
  ]).optional(),
  // Generic API
  apiEndpoint: z.string().max(2048).optional().nullable(),
  apiKey: z.string().max(4096).optional().nullable(),
  apiHeaders: z.string().max(8192).optional().nullable(),
  // Login
  loginUrl: z.string().max(2048).optional().nullable(),
  loginUsername: z.string().max(512).optional().nullable(),
  loginPassword: z.string().max(512).optional().nullable(),
  // SSH
  sshHost: z.string().max(512).optional().nullable(),
  sshPort: z.number().int().min(1).max(65535).optional().nullable(),
  sshUsername: z.string().max(256).optional().nullable(),
  sshPrivateKey: z.string().max(16384).optional().nullable(),
  // Platform
  platformProjectId: z.string().max(256).optional().nullable(),
  platformServiceId: z.string().max(256).optional().nullable(),
  platformToken: z.string().max(4096).optional().nullable(),
  platformEnvironmentId: z.string().max(256).optional().nullable(),
  // Webhook repair
  repairWebhookUrl: z.string().max(2048).optional().nullable(),
  repairWebhookSecret: z.string().max(512).optional().nullable(),
  // Health check config
  expectedStatusCode: z.number().int().min(100).max(599).optional(),
  expectedBodyContains: z.string().max(4096).optional().nullable(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
  followRedirects: z.boolean().optional(),
  sslCheckEnabled: z.boolean().optional(),
  performanceThresholdMs: z.number().int().min(100).max(60000).optional(),
  // Alerts
  alertsEnabled: z.boolean().optional(),
  alertEmail: z.string().email().max(320).optional().nullable(),
  alertWebhookUrl: z.string().max(2048).optional().nullable(),
  alertAfterConsecutiveFailures: z.number().int().min(1).max(100).optional(),
  autoRepairEnabled: z.boolean().optional(),
});

const updateSiteSchema = z.object({
  id: z.number().int(),
}).merge(addSiteSchema.partial());

// ─── Router ────────────────────────────────────────────────────────

export const siteMonitorRouter = router({

  // ─── Get Plan Limits ───────────────────────────────────────────
  getLimits: protectedProcedure.query(async ({ ctx }) => {
    const userPlan = await getUserPlan(ctx.user!.id);
    const limits = getMonitorLimits(userPlan.planId);
    return { planId: userPlan.planId, planName: userPlan.tier.name, limits };
  }),

  // ─── List Sites ────────────────────────────────────────────────
  listSites: protectedProcedure.query(async ({ ctx }) => {
    const userPlan = await getUserPlan(ctx.user!.id);
    enforceMonitorAccess(userPlan.planId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const sites = await db
      .select({
        id: monitoredSites.id,
        name: monitoredSites.name,
        url: monitoredSites.url,
        accessMethod: monitoredSites.accessMethod,
        checkIntervalSeconds: monitoredSites.checkIntervalSeconds,
        isPaused: monitoredSites.isPaused,
        lastCheckAt: monitoredSites.lastCheckAt,
        lastStatus: monitoredSites.lastStatus,
        lastResponseTimeMs: monitoredSites.lastResponseTimeMs,
        lastHttpStatusCode: monitoredSites.lastHttpStatusCode,
        consecutiveFailures: monitoredSites.consecutiveFailures,
        uptimePercent24h: monitoredSites.uptimePercent24h,
        uptimePercent7d: monitoredSites.uptimePercent7d,
        uptimePercent30d: monitoredSites.uptimePercent30d,
        alertsEnabled: monitoredSites.alertsEnabled,
        autoRepairEnabled: monitoredSites.autoRepairEnabled,
        sslCheckEnabled: monitoredSites.sslCheckEnabled,
        createdAt: monitoredSites.createdAt,
      })
      .from(monitoredSites)
      .where(eq(monitoredSites.userId, ctx.user!.id))
      .orderBy(desc(monitoredSites.createdAt));

    return sites;
  }),

  // ─── Get Single Site Details ───────────────────────────────────
  getSite: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const userPlan = await getUserPlan(ctx.user!.id);
      enforceMonitorAccess(userPlan.planId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [site] = await db
        .select()
        .from(monitoredSites)
        .where(and(eq(monitoredSites.id, input.id), eq(monitoredSites.userId, ctx.user!.id)))
        .limit(1);

      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

      // Mask sensitive fields
      return {
        ...site,
        apiKey: site.apiKey ? "••••••••" : null,
        loginPassword: site.loginPassword ? "••••••••" : null,
        sshPrivateKey: site.sshPrivateKey ? "••••••••" : null,
        platformToken: site.platformToken ? "••••••••" : null,
        repairWebhookSecret: site.repairWebhookSecret ? "••••••••" : null,
      };
    }),

  // ─── Add Site ──────────────────────────────────────────────────
  addSite: protectedProcedure
    .input(addSiteSchema)
    .mutation(async ({ ctx, input }) => {
      const userPlan = await getUserPlan(ctx.user!.id);
      enforceMonitorAccess(userPlan.planId);
      const limits = getMonitorLimits(userPlan.planId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Enforce site count limit
      if (limits.maxSites > 0) {
        const [{ total }] = await db
          .select({ total: count() })
          .from(monitoredSites)
          .where(eq(monitoredSites.userId, ctx.user!.id));
        if (total >= limits.maxSites) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Your ${userPlan.tier.name} plan allows up to ${limits.maxSites} monitored sites. Upgrade to add more.`,
          });
        }
      }

      // Enforce minimum interval
      const interval = input.checkIntervalSeconds ?? 300;
      if (interval < limits.minIntervalSeconds) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Minimum check interval for your plan is ${limits.minIntervalSeconds} seconds.`,
        });
      }

      const [result] = await db.insert(monitoredSites).values({
        userId: ctx.user!.id,
        name: input.name,
        url: input.url,
        checkIntervalSeconds: interval,
        accessMethod: input.accessMethod ?? "none",
        apiEndpoint: input.apiEndpoint ?? null,
        apiKey: input.apiKey ?? null,
        apiHeaders: input.apiHeaders ?? null,
        loginUrl: input.loginUrl ?? null,
        loginUsername: input.loginUsername ?? null,
        loginPassword: input.loginPassword ?? null,
        sshHost: input.sshHost ?? null,
        sshPort: input.sshPort ?? 22,
        sshUsername: input.sshUsername ?? null,
        sshPrivateKey: input.sshPrivateKey ?? null,
        platformProjectId: input.platformProjectId ?? null,
        platformServiceId: input.platformServiceId ?? null,
        platformToken: input.platformToken ?? null,
        platformEnvironmentId: input.platformEnvironmentId ?? null,
        repairWebhookUrl: input.repairWebhookUrl ?? null,
        repairWebhookSecret: input.repairWebhookSecret ?? null,
        expectedStatusCode: input.expectedStatusCode ?? 200,
        expectedBodyContains: input.expectedBodyContains ?? null,
        timeoutMs: input.timeoutMs ?? 30000,
        followRedirects: input.followRedirects ?? true,
        sslCheckEnabled: input.sslCheckEnabled ?? true,
        performanceThresholdMs: input.performanceThresholdMs ?? 5000,
        alertsEnabled: input.alertsEnabled ?? true,
        alertEmail: input.alertEmail ?? null,
        alertWebhookUrl: input.alertWebhookUrl ?? null,
        alertAfterConsecutiveFailures: input.alertAfterConsecutiveFailures ?? 3,
        autoRepairEnabled: input.autoRepairEnabled ?? true,
      });

      await logAudit({
        userId: ctx.user!.id,
        action: "site_monitor.add",
        resource: input.url,
        details: { message: `Added site "${input.name}" for monitoring` },
      });

      return { id: result.insertId, message: "Site added for monitoring" };
    }),

  // ─── Update Site ───────────────────────────────────────────────
  updateSite: protectedProcedure
    .input(updateSiteSchema)
    .mutation(async ({ ctx, input }) => {
      const userPlan = await getUserPlan(ctx.user!.id);
      enforceMonitorAccess(userPlan.planId);
      const limits = getMonitorLimits(userPlan.planId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const [existing] = await db
        .select({ id: monitoredSites.id })
        .from(monitoredSites)
        .where(and(eq(monitoredSites.id, input.id), eq(monitoredSites.userId, ctx.user!.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

      // Enforce minimum interval
      if (input.checkIntervalSeconds && input.checkIntervalSeconds < limits.minIntervalSeconds) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Minimum check interval for your plan is ${limits.minIntervalSeconds} seconds.`,
        });
      }

      const { id, ...updateData } = input;
      // Remove undefined values
      const cleanData = Object.fromEntries(
        Object.entries(updateData).filter(([_, v]) => v !== undefined)
      );

      if (Object.keys(cleanData).length > 0) {
        await db
          .update(monitoredSites)
          .set(cleanData)
          .where(and(eq(monitoredSites.id, id), eq(monitoredSites.userId, ctx.user!.id)));
      }

      await logAudit({
        userId: ctx.user!.id,
        action: "site_monitor.update",
        resource: `site:${id}`,
        details: { message: `Updated site monitoring configuration` },
      });

      return { success: true };
    }),

  // ─── Delete Site ───────────────────────────────────────────────
  deleteSite: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const userPlan = await getUserPlan(ctx.user!.id);
      enforceMonitorAccess(userPlan.planId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const [existing] = await db
        .select({ id: monitoredSites.id, name: monitoredSites.name, url: monitoredSites.url })
        .from(monitoredSites)
        .where(and(eq(monitoredSites.id, input.id), eq(monitoredSites.userId, ctx.user!.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

      // Delete related data
      await db.delete(repairLogs).where(and(eq(repairLogs.siteId, input.id), eq(repairLogs.userId, ctx.user!.id)));
      await db.delete(siteIncidents).where(and(eq(siteIncidents.siteId, input.id), eq(siteIncidents.userId, ctx.user!.id)));
      await db.delete(healthChecks).where(and(eq(healthChecks.siteId, input.id), eq(healthChecks.userId, ctx.user!.id)));
      await db.delete(monitoredSites).where(and(eq(monitoredSites.id, input.id), eq(monitoredSites.userId, ctx.user!.id)));

      await logAudit({
        userId: ctx.user!.id,
        action: "site_monitor.delete",
        resource: existing.url,
        details: { message: `Deleted site "${existing.name}" from monitoring` },
      });

      return { success: true };
    }),

  // ─── Toggle Pause ──────────────────────────────────────────────
  togglePause: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [site] = await db
        .select({ id: monitoredSites.id, isPaused: monitoredSites.isPaused })
        .from(monitoredSites)
        .where(and(eq(monitoredSites.id, input.id), eq(monitoredSites.userId, ctx.user!.id)))
        .limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

      await db
        .update(monitoredSites)
        .set({ isPaused: !site.isPaused })
        .where(eq(monitoredSites.id, input.id));

      return { isPaused: !site.isPaused };
    }),

  // ─── Get Health Check History ──────────────────────────────────
  getHealthHistory: protectedProcedure
    .input(z.object({
      siteId: z.number().int(),
      limit: z.number().int().min(1).max(500).optional(),
      hours: z.number().int().min(1).max(720).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userPlan = await getUserPlan(ctx.user!.id);
      enforceMonitorAccess(userPlan.planId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const [site] = await db
        .select({ id: monitoredSites.id })
        .from(monitoredSites)
        .where(and(eq(monitoredSites.id, input.siteId), eq(monitoredSites.userId, ctx.user!.id)))
        .limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

      const hours = input.hours ?? 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const checks = await db
        .select()
        .from(healthChecks)
        .where(
          and(
            eq(healthChecks.siteId, input.siteId),
            eq(healthChecks.userId, ctx.user!.id),
            gte(healthChecks.checkedAt, since),
          )
        )
        .orderBy(desc(healthChecks.checkedAt))
        .limit(input.limit ?? 100);

      return checks;
    }),

  // ─── Get Incidents ─────────────────────────────────────────────
  getIncidents: protectedProcedure
    .input(z.object({
      siteId: z.number().int().optional(),
      status: z.enum(["open", "investigating", "repairing", "resolved", "ignored"]).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userPlan = await getUserPlan(ctx.user!.id);
      enforceMonitorAccess(userPlan.planId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const conditions = [eq(siteIncidents.userId, ctx.user!.id)];
      if (input.siteId) conditions.push(eq(siteIncidents.siteId, input.siteId));
      if (input.status) conditions.push(eq(siteIncidents.status, input.status));

      const incidents = await db
        .select()
        .from(siteIncidents)
        .where(and(...conditions))
        .orderBy(desc(siteIncidents.detectedAt))
        .limit(input.limit ?? 50);

      return incidents;
    }),

  // ─── Resolve Incident ──────────────────────────────────────────
  resolveIncident: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      resolutionNote: z.string().max(4096).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [incident] = await db
        .select({ id: siteIncidents.id })
        .from(siteIncidents)
        .where(and(eq(siteIncidents.id, input.id), eq(siteIncidents.userId, ctx.user!.id)))
        .limit(1);
      if (!incident) throw new TRPCError({ code: "NOT_FOUND", message: "Incident not found" });

      await db
        .update(siteIncidents)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          resolutionNote: input.resolutionNote ?? null,
        })
        .where(eq(siteIncidents.id, input.id));

      return { success: true };
    }),

  // ─── Ignore Incident ──────────────────────────────────────────
  ignoreIncident: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db
        .update(siteIncidents)
        .set({ status: "ignored" })
        .where(and(eq(siteIncidents.id, input.id), eq(siteIncidents.userId, ctx.user!.id)));

      return { success: true };
    }),

  // ─── Get Repair Logs ───────────────────────────────────────────
  getRepairLogs: protectedProcedure
    .input(z.object({
      siteId: z.number().int().optional(),
      incidentId: z.number().int().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userPlan = await getUserPlan(ctx.user!.id);
      enforceMonitorAccess(userPlan.planId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const conditions = [eq(repairLogs.userId, ctx.user!.id)];
      if (input.siteId) conditions.push(eq(repairLogs.siteId, input.siteId));
      if (input.incidentId) conditions.push(eq(repairLogs.incidentId, input.incidentId));

      const logs = await db
        .select()
        .from(repairLogs)
        .where(and(...conditions))
        .orderBy(desc(repairLogs.createdAt))
        .limit(input.limit ?? 50);

      return logs;
    }),

  // ─── Trigger Manual Health Check ───────────────────────────────
  triggerCheck: protectedProcedure
    .input(z.object({ siteId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const userPlan = await getUserPlan(ctx.user!.id);
      enforceMonitorAccess(userPlan.planId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const [site] = await db
        .select()
        .from(monitoredSites)
        .where(and(eq(monitoredSites.id, input.siteId), eq(monitoredSites.userId, ctx.user!.id)))
        .limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

      // Perform the health check
      const result = await performHealthCheck(site, ctx.user!.id, db);
      return result;
    }),

  // ─── Trigger Manual Repair ─────────────────────────────────────
  triggerRepair: protectedProcedure
    .input(z.object({
      siteId: z.number().int(),
      action: z.enum([
        "restart_service", "redeploy", "rollback", "clear_cache",
        "fix_config", "ssl_renew", "dns_flush", "custom_command",
        "webhook_trigger", "platform_restart",
      ]),
      customCommand: z.string().max(4096).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userPlan = await getUserPlan(ctx.user!.id);
      enforceMonitorAccess(userPlan.planId);
      const limits = getMonitorLimits(userPlan.planId);
      if (!limits.autoRepairEnabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Auto-repair is not available on your plan.",
        });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [site] = await db
        .select()
        .from(monitoredSites)
        .where(and(eq(monitoredSites.id, input.siteId), eq(monitoredSites.userId, ctx.user!.id)))
        .limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

      const repairResult = await executeRepair(site, input.action, input.customCommand ?? null, ctx.user!.id, db);

      await logAudit({
        userId: ctx.user!.id,
        action: "site_monitor.repair",
        resource: site.url,
        details: { message: `Manual repair: ${input.action} on "${site.name}" — ${repairResult.status}` },
      });

      return repairResult;
    }),

  // ─── Test Connection ───────────────────────────────────────────
  testConnection: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const userPlan = await getUserPlan(ctx.user!.id);
      enforceMonitorAccess(userPlan.planId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [site] = await db
        .select()
        .from(monitoredSites)
        .where(and(eq(monitoredSites.id, input.id), eq(monitoredSites.userId, ctx.user!.id)))
        .limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

      // Test basic HTTP connectivity
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), site.timeoutMs ?? 30000);
        const response = await fetch(site.url, {
          method: "GET",
          signal: controller.signal,
          redirect: site.followRedirects ? "follow" : "manual",
          headers: { "User-Agent": "ArchibaldTitan-SiteMonitor/1.0" },
        });
        clearTimeout(timeout);
        const elapsed = Date.now() - start;

        // Test platform API if configured
        let platformStatus = "not_configured";
        if (site.accessMethod !== "none" && site.platformToken) {
          platformStatus = await testPlatformConnection(site);
        }

        return {
          success: true,
          httpStatus: response.status,
          responseTimeMs: elapsed,
          platformConnectionStatus: platformStatus,
          message: `Site responded with HTTP ${response.status} in ${elapsed}ms`,
        };
      } catch (err: any) {
        return {
          success: false,
          httpStatus: null,
          responseTimeMs: Date.now() - start,
          platformConnectionStatus: "error",
          message: `Connection failed: ${err.message}`,
        };
      }
    }),

  // ─── Dashboard Stats ───────────────────────────────────────────
  getDashboardStats: protectedProcedure.query(async ({ ctx }) => {
    const userPlan = await getUserPlan(ctx.user!.id);
    enforceMonitorAccess(userPlan.planId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const sites = await db
      .select({
        id: monitoredSites.id,
        lastStatus: monitoredSites.lastStatus,
        isPaused: monitoredSites.isPaused,
      })
      .from(monitoredSites)
      .where(eq(monitoredSites.userId, ctx.user!.id));

    const activeSites = sites.filter(s => !s.isPaused);
    const healthySites = activeSites.filter(s => s.lastStatus === "healthy").length;
    const degradedSites = activeSites.filter(s => s.lastStatus === "degraded").length;
    const downSites = activeSites.filter(s => s.lastStatus === "down" || s.lastStatus === "error").length;

    // Open incidents
    const [{ openIncidents }] = await db
      .select({ openIncidents: count() })
      .from(siteIncidents)
      .where(and(
        eq(siteIncidents.userId, ctx.user!.id),
        sql`${siteIncidents.status} IN ('open', 'investigating', 'repairing')`,
      ));

    // Repairs in last 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ repairsToday }] = await db
      .select({ repairsToday: count() })
      .from(repairLogs)
      .where(and(
        eq(repairLogs.userId, ctx.user!.id),
        gte(repairLogs.createdAt, since24h),
      ));

    // Average response time across all sites (last hour)
    const since1h = new Date(Date.now() - 60 * 60 * 1000);
    const [avgResult] = await db
      .select({ avgResponseTime: avg(healthChecks.responseTimeMs) })
      .from(healthChecks)
      .where(and(
        eq(healthChecks.userId, ctx.user!.id),
        gte(healthChecks.checkedAt, since1h),
      ));

    return {
      totalSites: sites.length,
      activeSites: activeSites.length,
      pausedSites: sites.length - activeSites.length,
      healthySites,
      degradedSites,
      downSites,
      openIncidents: openIncidents ?? 0,
      repairsToday: repairsToday ?? 0,
      avgResponseTimeMs: avgResult?.avgResponseTime ? Math.round(Number(avgResult.avgResponseTime)) : null,
      limits: getMonitorLimits(userPlan.planId),
    };
  }),
});

// ═══════════════════════════════════════════════════════════════════
// ─── Health Check Engine ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

interface HealthCheckResult {
  status: "healthy" | "degraded" | "down" | "error";
  httpStatusCode: number | null;
  responseTimeMs: number;
  sslValid: boolean | null;
  sslExpiresAt: Date | null;
  sslIssuer: string | null;
  dnsTimeMs: number | null;
  ttfbMs: number | null;
  totalTimeMs: number;
  bodyContainsMatch: boolean | null;
  contentLength: number | null;
  errorMessage: string | null;
  errorType: string | null;
}

export async function performHealthCheck(
  site: typeof monitoredSites.$inferSelect,
  userId: number,
  db: any,
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  let result: HealthCheckResult = {
    status: "error",
    httpStatusCode: null,
    responseTimeMs: 0,
    sslValid: null,
    sslExpiresAt: null,
    sslIssuer: null,
    dnsTimeMs: null,
    ttfbMs: null,
    totalTimeMs: 0,
    bodyContainsMatch: null,
    contentLength: null,
    errorMessage: null,
    errorType: null,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), site.timeoutMs ?? 30000);

    const response = await fetch(site.url, {
      method: "GET",
      signal: controller.signal,
      redirect: site.followRedirects ? "follow" : "manual",
      headers: { "User-Agent": "ArchibaldTitan-SiteMonitor/1.0" },
    });
    clearTimeout(timeout);

    const elapsed = Date.now() - startTime;
    const body = await response.text();

    result.httpStatusCode = response.status;
    result.responseTimeMs = elapsed;
    result.totalTimeMs = elapsed;
    result.contentLength = body.length;

    // Body content check
    if (site.expectedBodyContains) {
      result.bodyContainsMatch = body.includes(site.expectedBodyContains);
    }

    // Determine status
    const expectedStatus = site.expectedStatusCode ?? 200;
    const perfThreshold = site.performanceThresholdMs ?? 5000;

    if (response.status === expectedStatus) {
      if (site.expectedBodyContains && !result.bodyContainsMatch) {
        result.status = "error";
        result.errorMessage = "Response body does not contain expected content";
        result.errorType = "content_mismatch";
      } else if (elapsed > perfThreshold) {
        result.status = "degraded";
      } else {
        result.status = "healthy";
      }
    } else if (response.status >= 500) {
      result.status = "down";
      result.errorMessage = `Server error: HTTP ${response.status}`;
      result.errorType = "server_error";
    } else if (response.status >= 400) {
      result.status = "error";
      result.errorMessage = `Client error: HTTP ${response.status}`;
      result.errorType = "client_error";
    } else {
      result.status = "degraded";
    }
  } catch (err: any) {
    result.responseTimeMs = Date.now() - startTime;
    result.totalTimeMs = result.responseTimeMs;

    if (err.name === "AbortError") {
      result.status = "down";
      result.errorMessage = `Request timed out after ${site.timeoutMs ?? 30000}ms`;
      result.errorType = "timeout";
    } else if (err.code === "ENOTFOUND") {
      result.status = "down";
      result.errorMessage = `DNS resolution failed for ${site.url}`;
      result.errorType = "dns_failure";
    } else if (err.code === "ECONNREFUSED") {
      result.status = "down";
      result.errorMessage = `Connection refused by ${site.url}`;
      result.errorType = "connection_refused";
    } else if (err.message?.includes("certificate") || err.message?.includes("SSL") || err.message?.includes("TLS")) {
      result.status = "error";
      result.errorMessage = `SSL/TLS error: ${err.message}`;
      result.errorType = "ssl_error";
      result.sslValid = false;
    } else {
      result.status = "down";
      result.errorMessage = err.message || "Unknown error";
      result.errorType = "network_error";
    }
  }

  // SSL check for HTTPS sites
  if (site.sslCheckEnabled && site.url.startsWith("https://")) {
    try {
      const sslResult = await checkSSL(site.url);
      result.sslValid = sslResult.valid;
      result.sslExpiresAt = sslResult.expiresAt;
      result.sslIssuer = sslResult.issuer;
    } catch {
      // SSL check failed but don't override the main status
    }
  }

  // Save the health check result
  await db.insert(healthChecks).values({
    siteId: site.id,
    userId,
    status: result.status,
    httpStatusCode: result.httpStatusCode,
    responseTimeMs: result.responseTimeMs,
    sslValid: result.sslValid,
    sslExpiresAt: result.sslExpiresAt,
    sslIssuer: result.sslIssuer,
    dnsTimeMs: result.dnsTimeMs,
    ttfbMs: result.ttfbMs,
    totalTimeMs: result.totalTimeMs,
    bodyContainsMatch: result.bodyContainsMatch,
    contentLength: result.contentLength,
    errorMessage: result.errorMessage,
    errorType: result.errorType,
    checkedAt: new Date(),
  });

  // Update site status
  const newConsecutiveFailures =
    result.status === "healthy" ? 0 : (site.consecutiveFailures ?? 0) + 1;

  await db
    .update(monitoredSites)
    .set({
      lastCheckAt: new Date(),
      lastStatus: result.status,
      lastResponseTimeMs: result.responseTimeMs,
      lastHttpStatusCode: result.httpStatusCode,
      consecutiveFailures: newConsecutiveFailures,
    })
    .where(eq(monitoredSites.id, site.id));

  // Create incident if threshold reached
  const alertThreshold = site.alertAfterConsecutiveFailures ?? 3;
  if (
    newConsecutiveFailures >= alertThreshold &&
    (site.consecutiveFailures ?? 0) < alertThreshold
  ) {
    await createIncident(site, result, userId, db);
  }

  // Auto-resolve incident if site is back to healthy
  if (result.status === "healthy" && (site.consecutiveFailures ?? 0) > 0) {
    await autoResolveIncidents(site.id, userId, db);
  }

  return result;
}

// ─── SSL Check ───────────────────────────────────────────────────

async function checkSSL(url: string): Promise<{
  valid: boolean;
  expiresAt: Date | null;
  issuer: string | null;
}> {
  try {
    const https = await import("https");
    const urlObj = new URL(url);
    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: urlObj.hostname,
          port: 443,
          method: "HEAD",
          rejectUnauthorized: true,
          timeout: 10000,
        },
        (res) => {
          const cert = (res.socket as any).getPeerCertificate?.();
          if (cert && cert.valid_to) {
            resolve({
              valid: true,
              expiresAt: new Date(cert.valid_to),
              issuer: cert.issuer?.O || cert.issuer?.CN || null,
            });
          } else {
            resolve({ valid: true, expiresAt: null, issuer: null });
          }
          res.destroy();
        }
      );
      req.on("error", (err: any) => {
        if (err.code === "CERT_HAS_EXPIRED" || err.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
          resolve({ valid: false, expiresAt: null, issuer: null });
        } else {
          resolve({ valid: true, expiresAt: null, issuer: null });
        }
      });
      req.on("timeout", () => {
        req.destroy();
        resolve({ valid: true, expiresAt: null, issuer: null });
      });
      req.end();
    });
  } catch {
    return { valid: true, expiresAt: null, issuer: null };
  }
}

// ─── Incident Management ─────────────────────────────────────────

async function createIncident(
  site: typeof monitoredSites.$inferSelect,
  checkResult: HealthCheckResult,
  userId: number,
  db: any,
): Promise<void> {
  // Determine incident type and severity
  let type: "downtime" | "ssl_expiry" | "ssl_invalid" | "performance_degradation" | "error_spike" | "deploy_failure" | "content_mismatch" | "dns_failure" = "downtime";
  let severity: "low" | "medium" | "high" | "critical" = "high";
  let title = `${site.name} is down`;

  if (checkResult.errorType === "dns_failure") {
    type = "dns_failure";
    severity = "critical";
    title = `DNS failure for ${site.name}`;
  } else if (checkResult.errorType === "ssl_error" || checkResult.sslValid === false) {
    type = "ssl_invalid";
    severity = "critical";
    title = `SSL certificate invalid for ${site.name}`;
  } else if (checkResult.errorType === "content_mismatch") {
    type = "content_mismatch";
    severity = "medium";
    title = `Content mismatch on ${site.name}`;
  } else if (checkResult.status === "degraded") {
    type = "performance_degradation";
    severity = "medium";
    title = `Performance degradation on ${site.name}`;
  } else if (checkResult.errorType === "server_error") {
    type = "error_spike";
    severity = "high";
    title = `Server error on ${site.name} (HTTP ${checkResult.httpStatusCode})`;
  }

  // Check if there's already an open incident for this site
  const [existingIncident] = await db
    .select({ id: siteIncidents.id })
    .from(siteIncidents)
    .where(and(
      eq(siteIncidents.siteId, site.id),
      eq(siteIncidents.userId, userId),
      sql`${siteIncidents.status} IN ('open', 'investigating', 'repairing')`,
    ))
    .limit(1);

  if (existingIncident) return; // Don't create duplicate incidents

  await db.insert(siteIncidents).values({
    siteId: site.id,
    userId,
    type,
    severity,
    status: "open",
    title,
    description: checkResult.errorMessage || `Site check returned status: ${checkResult.status}`,
    triggerHttpStatus: checkResult.httpStatusCode,
    triggerResponseTimeMs: checkResult.responseTimeMs,
    triggerErrorMessage: checkResult.errorMessage,
  });

  // Trigger auto-repair if enabled
  if (site.autoRepairEnabled && site.accessMethod !== "none") {
    await attemptAutoRepair(site, userId, db);
  }
}

async function autoResolveIncidents(siteId: number, userId: number, db: any): Promise<void> {
  await db
    .update(siteIncidents)
    .set({
      status: "resolved",
      resolvedAt: new Date(),
      resolutionNote: "Auto-resolved: site returned to healthy status",
    })
    .where(and(
      eq(siteIncidents.siteId, siteId),
      eq(siteIncidents.userId, userId),
      sql`${siteIncidents.status} IN ('open', 'investigating', 'repairing')`,
    ));
}

// ═══════════════════════════════════════════════════════════════════
// ─── Auto-Repair Engine ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

async function attemptAutoRepair(
  site: typeof monitoredSites.$inferSelect,
  userId: number,
  db: any,
): Promise<void> {
  // Determine the best repair action based on access method
  let action: string;
  let method: string;

  switch (site.accessMethod) {
    case "railway":
    case "vercel":
    case "netlify":
    case "render":
    case "heroku":
      action = "platform_restart";
      method = "platform";
      break;
    case "api":
      action = "restart_service";
      method = "api";
      break;
    case "ssh":
      action = "restart_service";
      method = "ssh";
      break;
    case "webhook":
      action = "webhook_trigger";
      method = "webhook";
      break;
    default:
      return; // No repair method available
  }

  await executeRepair(site, action as any, null, userId, db);
}

async function executeRepair(
  site: typeof monitoredSites.$inferSelect,
  action: string,
  customCommand: string | null,
  userId: number,
  db: any,
): Promise<{ status: string; message: string; repairLogId: number }> {
  // Create repair log entry
  const [logEntry] = await db.insert(repairLogs).values({
    siteId: site.id,
    userId,
    action,
    method: getMethodForAction(site, action),
    status: "running",
    command: customCommand,
    startedAt: new Date(),
  });
  const repairLogId = logEntry.insertId;

  try {
    let output = "";
    let success = false;

    switch (site.accessMethod) {
      case "railway":
        ({ output, success } = await repairViaRailway(site));
        break;
      case "vercel":
        ({ output, success } = await repairViaVercel(site));
        break;
      case "netlify":
        ({ output, success } = await repairViaNetlify(site));
        break;
      case "render":
        ({ output, success } = await repairViaRender(site));
        break;
      case "heroku":
        ({ output, success } = await repairViaHeroku(site));
        break;
      case "webhook":
        ({ output, success } = await repairViaWebhook(site));
        break;
      case "api":
        ({ output, success } = await repairViaApi(site, action, customCommand));
        break;
      case "ssh":
        ({ output, success } = await repairViaSSH(site, action, customCommand));
        break;
      default:
        output = "No repair method configured";
        success = false;
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - (new Date()).getTime();

    await db
      .update(repairLogs)
      .set({
        status: success ? "success" : "failed",
        output,
        completedAt,
        durationMs: Math.abs(durationMs),
      })
      .where(eq(repairLogs.id, repairLogId));

    // Update incident status
    if (success) {
      await db
        .update(siteIncidents)
        .set({
          status: "repairing",
          autoRepairAttempted: true,
          autoRepairAttempts: sql`${siteIncidents.autoRepairAttempts} + 1`,
        })
        .where(and(
          eq(siteIncidents.siteId, site.id),
          eq(siteIncidents.userId, userId),
          sql`${siteIncidents.status} IN ('open', 'investigating')`,
        ));
    }

    return {
      status: success ? "success" : "failed",
      message: output,
      repairLogId,
    };
  } catch (err: any) {
    await db
      .update(repairLogs)
      .set({
        status: "failed",
        errorMessage: err.message,
        completedAt: new Date(),
      })
      .where(eq(repairLogs.id, repairLogId));

    return {
      status: "failed",
      message: err.message,
      repairLogId,
    };
  }
}

function getMethodForAction(site: typeof monitoredSites.$inferSelect, action: string): "api" | "ssh" | "login" | "webhook" | "platform" {
  if (["railway", "vercel", "netlify", "render", "heroku"].includes(site.accessMethod ?? "")) return "platform";
  if (site.accessMethod === "webhook") return "webhook";
  if (site.accessMethod === "ssh") return "ssh";
  if (site.accessMethod === "login") return "login";
  return "api";
}

// ─── Platform-Specific Repair Functions ──────────────────────────

async function repairViaRailway(site: typeof monitoredSites.$inferSelect): Promise<{ output: string; success: boolean }> {
  if (!site.platformToken || !site.platformProjectId) {
    return { output: "Railway token or project ID not configured", success: false };
  }
  try {
    // Railway GraphQL API — trigger redeploy
    const query = `
      mutation serviceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
        serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
      }
    `;
    const response = await fetch("https://backboard.railway.app/graphql/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${site.platformToken}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          serviceId: site.platformServiceId || site.platformProjectId,
          environmentId: site.platformEnvironmentId || "production",
        },
      }),
    });
    const data = await response.json();
    if (data.errors) {
      return { output: `Railway API error: ${JSON.stringify(data.errors)}`, success: false };
    }
    return { output: "Railway service redeploy triggered successfully", success: true };
  } catch (err: any) {
    return { output: `Railway repair failed: ${err.message}`, success: false };
  }
}

async function repairViaVercel(site: typeof monitoredSites.$inferSelect): Promise<{ output: string; success: boolean }> {
  if (!site.platformToken || !site.platformProjectId) {
    return { output: "Vercel token or project ID not configured", success: false };
  }
  try {
    // Vercel API — create new deployment (redeploy)
    const response = await fetch(`https://api.vercel.com/v13/deployments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${site.platformToken}`,
      },
      body: JSON.stringify({
        name: site.platformProjectId,
        target: "production",
      }),
    });
    const data = await response.json();
    if (data.error) {
      return { output: `Vercel API error: ${data.error.message}`, success: false };
    }
    return { output: `Vercel redeploy triggered: ${data.url || "deployment started"}`, success: true };
  } catch (err: any) {
    return { output: `Vercel repair failed: ${err.message}`, success: false };
  }
}

async function repairViaNetlify(site: typeof monitoredSites.$inferSelect): Promise<{ output: string; success: boolean }> {
  if (!site.platformToken || !site.platformProjectId) {
    return { output: "Netlify token or site ID not configured", success: false };
  }
  try {
    // Netlify API — trigger build
    const response = await fetch(
      `https://api.netlify.com/api/v1/sites/${site.platformProjectId}/builds`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${site.platformToken}`,
        },
      }
    );
    const data = await response.json();
    if (response.status >= 400) {
      return { output: `Netlify API error: ${JSON.stringify(data)}`, success: false };
    }
    return { output: `Netlify build triggered: ${data.id || "build started"}`, success: true };
  } catch (err: any) {
    return { output: `Netlify repair failed: ${err.message}`, success: false };
  }
}

async function repairViaRender(site: typeof monitoredSites.$inferSelect): Promise<{ output: string; success: boolean }> {
  if (!site.platformToken || !site.platformServiceId) {
    return { output: "Render token or service ID not configured", success: false };
  }
  try {
    // Render API — restart service
    const response = await fetch(
      `https://api.render.com/v1/services/${site.platformServiceId}/restart`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${site.platformToken}`,
        },
      }
    );
    if (response.status >= 400) {
      const data = await response.json();
      return { output: `Render API error: ${JSON.stringify(data)}`, success: false };
    }
    return { output: "Render service restart triggered", success: true };
  } catch (err: any) {
    return { output: `Render repair failed: ${err.message}`, success: false };
  }
}

async function repairViaHeroku(site: typeof monitoredSites.$inferSelect): Promise<{ output: string; success: boolean }> {
  if (!site.platformToken || !site.platformProjectId) {
    return { output: "Heroku token or app name not configured", success: false };
  }
  try {
    // Heroku API — restart all dynos
    const response = await fetch(
      `https://api.heroku.com/apps/${site.platformProjectId}/dynos`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${site.platformToken}`,
          Accept: "application/vnd.heroku+json; version=3",
        },
      }
    );
    if (response.status >= 400) {
      const data = await response.json();
      return { output: `Heroku API error: ${JSON.stringify(data)}`, success: false };
    }
    return { output: "Heroku dynos restarted successfully", success: true };
  } catch (err: any) {
    return { output: `Heroku repair failed: ${err.message}`, success: false };
  }
}

async function repairViaWebhook(site: typeof monitoredSites.$inferSelect): Promise<{ output: string; success: boolean }> {
  if (!site.repairWebhookUrl) {
    return { output: "Repair webhook URL not configured", success: false };
  }
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "ArchibaldTitan-SiteMonitor/1.0",
    };
    if (site.repairWebhookSecret) {
      headers["X-Webhook-Secret"] = site.repairWebhookSecret;
    }
    const response = await fetch(site.repairWebhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event: "repair_triggered",
        site: { id: site.id, name: site.name, url: site.url },
        timestamp: new Date().toISOString(),
      }),
    });
    if (!response.ok) {
      return { output: `Webhook returned HTTP ${response.status}`, success: false };
    }
    return { output: "Repair webhook triggered successfully", success: true };
  } catch (err: any) {
    return { output: `Webhook repair failed: ${err.message}`, success: false };
  }
}

async function repairViaApi(
  site: typeof monitoredSites.$inferSelect,
  action: string,
  customCommand: string | null,
): Promise<{ output: string; success: boolean }> {
  if (!site.apiEndpoint) {
    return { output: "API endpoint not configured", success: false };
  }
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "ArchibaldTitan-SiteMonitor/1.0",
    };
    if (site.apiKey) {
      headers["Authorization"] = `Bearer ${site.apiKey}`;
    }
    if (site.apiHeaders) {
      try {
        const customHeaders = JSON.parse(site.apiHeaders);
        Object.assign(headers, customHeaders);
      } catch { /* ignore invalid JSON */ }
    }

    const response = await fetch(site.apiEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        action,
        command: customCommand,
        site: { name: site.name, url: site.url },
        timestamp: new Date().toISOString(),
      }),
    });
    const text = await response.text();
    return {
      output: `API response (${response.status}): ${text.slice(0, 2000)}`,
      success: response.ok,
    };
  } catch (err: any) {
    return { output: `API repair failed: ${err.message}`, success: false };
  }
}

async function repairViaSSH(
  site: typeof monitoredSites.$inferSelect,
  action: string,
  customCommand: string | null,
): Promise<{ output: string; success: boolean }> {
  if (!site.sshHost || !site.sshUsername) {
    return { output: "SSH host or username not configured", success: false };
  }

  // Determine the command to run
  let command = customCommand;
  if (!command) {
    switch (action) {
      case "restart_service":
        command = "sudo systemctl restart $(systemctl list-units --type=service --state=running --no-legend | head -1 | awk '{print $1}')";
        break;
      case "clear_cache":
        command = "sudo sync && echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null && echo 'Cache cleared'";
        break;
      case "dns_flush":
        command = "sudo systemd-resolve --flush-caches 2>/dev/null || sudo resolvectl flush-caches 2>/dev/null && echo 'DNS cache flushed'";
        break;
      default:
        command = "echo 'No default command for this action'";
    }
  }

  try {
    // Use Node.js child_process to execute SSH command
    const { execSync } = await import("child_process");
    const sshArgs = [
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=10",
      "-p", String(site.sshPort ?? 22),
    ];

    if (site.sshPrivateKey) {
      // Write key to temp file
      const fs = await import("fs");
      const os = await import("os");
      const path = await import("path");
      const keyPath = path.join(os.tmpdir(), `titan_ssh_${site.id}_${Date.now()}`);
      fs.writeFileSync(keyPath, site.sshPrivateKey, { mode: 0o600 });
      sshArgs.push("-i", keyPath);

      try {
        const output = execSync(
          `ssh ${sshArgs.join(" ")} ${site.sshUsername}@${site.sshHost} "${command.replace(/"/g, '\\"')}"`,
          { timeout: 30000, encoding: "utf-8" }
        );
        fs.unlinkSync(keyPath);
        return { output: output.slice(0, 4000), success: true };
      } finally {
        try { fs.unlinkSync(keyPath); } catch { /* ignore */ }
      }
    } else {
      return { output: "SSH private key not configured", success: false };
    }
  } catch (err: any) {
    return { output: `SSH repair failed: ${err.message}`, success: false };
  }
}

async function testPlatformConnection(site: typeof monitoredSites.$inferSelect): Promise<string> {
  try {
    switch (site.accessMethod) {
      case "railway": {
        const res = await fetch("https://backboard.railway.app/graphql/v2", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${site.platformToken}`,
          },
          body: JSON.stringify({ query: "{ me { id } }" }),
        });
        return res.ok ? "connected" : "auth_failed";
      }
      case "vercel": {
        const res = await fetch("https://api.vercel.com/v2/user", {
          headers: { Authorization: `Bearer ${site.platformToken}` },
        });
        return res.ok ? "connected" : "auth_failed";
      }
      case "netlify": {
        const res = await fetch("https://api.netlify.com/api/v1/user", {
          headers: { Authorization: `Bearer ${site.platformToken}` },
        });
        return res.ok ? "connected" : "auth_failed";
      }
      default:
        return "unsupported_platform";
    }
  } catch {
    return "connection_error";
  }
}

// ─── Background Monitoring Loop ──────────────────────────────────
// This is called from the main server startup to begin periodic checks.

export async function startMonitoringLoop(): Promise<void> {
  const LOOP_INTERVAL_MS = 15_000; // Check every 15 seconds for sites that need checking

  async function tick() {
    try {
      const db = await getDb();
      if (!db) return;

      const now = new Date();

      // Find sites that are due for a check
      const dueSites = await db
        .select()
        .from(monitoredSites)
        .where(
          and(
            eq(monitoredSites.isPaused, false),
            sql`(${monitoredSites.lastCheckAt} IS NULL OR TIMESTAMPDIFF(SECOND, ${monitoredSites.lastCheckAt}, NOW()) >= ${monitoredSites.checkIntervalSeconds})`,
          )
        )
        .limit(10); // Process up to 10 sites per tick to avoid overload

      for (const site of dueSites) {
        try {
          await performHealthCheck(site, site.userId, db);
        } catch (err) {
          console.error(`[SiteMonitor] Error checking site ${site.id} (${site.url}):`, err);
        }
      }
    } catch (err) {
      console.error("[SiteMonitor] Loop error:", err);
    }
  }

  // Start the loop
  setInterval(tick, LOOP_INTERVAL_MS);
  console.log("[SiteMonitor] Background monitoring loop started (15s interval)");
}
