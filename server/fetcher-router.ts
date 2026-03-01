import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { fetcherJobs } from "../drizzle/schema";
import {
  createJob,
  getJobs,
  getJob,
  getJobTasks,
  cancelJob,
  getCredentials,
  deleteCredential,
  getDecryptedCredentials,
  exportCredentials,
  getSettings,
  updateSettings,
  getOrCreateKillSwitch,
  activateKillSwitch,
  deactivateKillSwitch,
  resetKillSwitch,
  isKillSwitchActive,
  storeManualCredential,
} from "./fetcher-db";
import { executeJob, abortJob } from "./fetcher-engine/executor";
import { PROVIDERS } from "../shared/fetcher";
import {
  addProxy,
  getProxies,
  getProxy,
  updateProxy,
  deleteProxy,
  testAndUpdateProxy,
  parseProxyUrl,
  PROVIDER_PROXY_REQUIREMENTS,
  RECOMMENDED_PROXY_PROVIDERS,
} from "./fetcher-engine/proxy-manager";
import {
  runPreflightChecks,
  getSystemHealth,
  getCircuitBreakerSummary,
  getCircuitState,
  resetCircuitBreaker,
  getActiveJobCount,
  sanitizeEmail,
  validatePassword,
  validateProviderIds,
} from "./fetcher-engine/safety-engine";
import {
  getUserPlan,
  getPlanUsage,
  enforceFetchLimit,
  enforceProviderAccess,
  enforceProxySlotLimit,
  enforceExportFormat,
  enforceFeature,
  getAllowedProviders,
} from "./subscription-gate";
import { createLogger } from "./_core/logger.js";
const log = createLogger("FetcherRouter");

export const fetcherRouter = router({
  // ─── Plan Usage ────────────────────────────────────────────────
  planUsage: protectedProcedure.query(async ({ ctx }) => {
    return getPlanUsage(ctx.user.id);
  }),

  // ─── Providers (filtered by plan) ─────────────────────────────
  providers: protectedProcedure.query(async ({ ctx }) => {
    const plan = await getUserPlan(ctx.user.id);
    const allowed = getAllowedProviders(plan.planId);
    const allProviders = Object.values(PROVIDERS);

    // Mark each provider as locked or unlocked based on plan
    const providers = allProviders.map((p) => ({
      ...p,
      locked: allowed ? !allowed.includes(p.id) : false,
    }));

    return {
      providers,
      proxyRequirements: PROVIDER_PROXY_REQUIREMENTS,
      currentPlan: plan.planId,
    };
  }),

  // ─── Jobs ───────────────────────────────────────────────────────
  createJob: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
      providers: z.array(z.string()).min(1),
      skipPreflight: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 0. Input sanitization
      const sanitizedEmail = sanitizeEmail(input.email);
      const passwordCheck = validatePassword(input.password);
      if (!passwordCheck.valid) {
        throw new Error(passwordCheck.reason || "Invalid password");
      }
      const providerCheck = validateProviderIds(input.providers);
      if (providerCheck.invalid.length > 0) {
        throw new Error(`Unknown providers: ${providerCheck.invalid.join(", ")}`);
      }

      // 1. Kill switch check
      const killed = await isKillSwitchActive(ctx.user.id);
      if (killed) {
        throw new Error("Kill switch is active. Deactivate it before creating new jobs.");
      }

      // 2. Pre-flight checks (unless explicitly skipped)
      if (!input.skipPreflight) {
        const settings = await getSettings(ctx.user.id);
        const preflight = await runPreflightChecks({
          providers: providerCheck.valid,
          hasProxy: !!(settings.proxyServer) || (await getProxies(ctx.user.id)).length > 0,
          hasCaptchaSolver: !!(settings.captchaService && settings.captchaApiKey),
          isKillSwitchActive: killed,
          concurrentJobs: getActiveJobCount(ctx.user.id),
        });

        if (!preflight.passed) {
          throw new Error(`Pre-flight failed: ${preflight.blockers.join("; ")}`);
        }
      }

      // 3. Enforce monthly fetch limit
      await enforceFetchLimit(ctx.user.id);

      // 4. Enforce provider access
      await enforceProviderAccess(ctx.user.id, providerCheck.valid);

      const job = await createJob(ctx.user.id, sanitizedEmail, input.password, providerCheck.valid);

      // Start the real browser automation asynchronously
      executeJob(job.id, ctx.user.id).catch((err) => {
        log.error(`[Fetcher] Job ${job.id} execution error:`, { error: String(err) });
      });

      return job;
    }),

  listJobs: protectedProcedure.query(async ({ ctx }) => {
    return getJobs(ctx.user.id);
  }),

  getJob: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const job = await getJob(input.jobId, ctx.user.id);
      if (!job) throw new Error("Job not found");
      const tasks = await getJobTasks(input.jobId);
      return { job, tasks };
    }),

  cancelJob: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      abortJob(input.jobId);
      await cancelJob(input.jobId, ctx.user.id);
      return { success: true };
    }),

  // ─── Credentials ──────────────────────────────────────────────
  listCredentials: protectedProcedure.query(async ({ ctx }) => {
    const creds = await getCredentials(ctx.user.id);
    return creds.map(c => ({
      ...c,
      encryptedValue: "***encrypted***",
    }));
  }),

  revealCredential: protectedProcedure
    .input(z.object({ credentialId: z.number() }))
    .query(async ({ ctx, input }) => {
      const creds = await getDecryptedCredentials(ctx.user.id);
      if (input.credentialId === 0) {
        // Legacy: return all (for backward compat)
        return creds;
      }
      // Return only the requested credential
      const found = creds.filter(c => c.id === input.credentialId);
      if (found.length === 0) throw new Error("Credential not found");
      return found;
    }),

  addCredential: protectedProcedure
    .input(z.object({
      providerId: z.string().min(1),
      providerName: z.string().min(1),
      keyType: z.string().min(1),
      value: z.string().min(1),
      keyLabel: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await storeManualCredential(
        ctx.user.id,
        input.providerId,
        input.providerName,
        input.keyType,
        input.value,
        input.keyLabel,
      );
      return { success: true };
    }),

  deleteCredential: protectedProcedure
    .input(z.object({ credentialId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteCredential(input.credentialId, ctx.user.id);
      return { success: true };
    }),

  // ─── Export (gated by plan) ───────────────────────────────────
  exportCredentials: protectedProcedure
    .input(z.object({ format: z.enum(["json", "env", "csv"]) }))
    .query(async ({ ctx, input }) => {
      // Enforce export format based on plan
      const plan = await getUserPlan(ctx.user.id);
      enforceExportFormat(plan.planId, input.format);
      return exportCredentials(ctx.user.id, input.format as "json" | "env" | "csv");
    }),

  // ─── Settings ─────────────────────────────────────────────────
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const settings = await getSettings(ctx.user.id);
    const plan = await getUserPlan(ctx.user.id);
    return {
      ...settings,
      proxyPassword: settings.proxyPassword ? "***" : null,
      captchaApiKey: settings.captchaApiKey ? "***" : null,
      currentPlan: plan.planId,
    };
  }),

  updateSettings: protectedProcedure
    .input(z.object({
      proxyServer: z.string().nullable().optional(),
      proxyUsername: z.string().nullable().optional(),
      proxyPassword: z.string().nullable().optional(),
      captchaService: z.string().nullable().optional(),
      captchaApiKey: z.string().nullable().optional(),
      headless: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Gate CAPTCHA settings behind Pro+
      if (input.captchaService || input.captchaApiKey) {
        const plan = await getUserPlan(ctx.user.id);
        enforceFeature(plan.planId, "captcha_solving", "CAPTCHA auto-solving");
      }
      // Don't overwrite secrets with null when user didn't change them
      const cleanInput = { ...input };
      if (cleanInput.proxyPassword === null) delete cleanInput.proxyPassword;
      if (cleanInput.captchaApiKey === null) delete cleanInput.captchaApiKey;
      return updateSettings(ctx.user.id, cleanInput);
    }),

  // ─── Proxy Pool Management (gated by plan) ────────────────────
  listProxies: protectedProcedure.query(async ({ ctx }) => {
    const proxies = await getProxies(ctx.user.id);
    const plan = await getUserPlan(ctx.user.id);
    return {
      proxies: proxies.map(p => ({
        ...p,
        password: p.password ? "***" : null,
      })),
      currentPlan: plan.planId,
      maxSlots: plan.tier.limits.proxySlots,
    };
  }),

  addProxy: protectedProcedure
    .input(z.object({
      label: z.string().min(1).max(128),
      protocol: z.enum(["http", "https", "socks5"]),
      host: z.string().min(1).max(256),
      port: z.number().min(1).max(65535),
      username: z.string().max(128).optional(),
      password: z.string().optional(),
      proxyType: z.enum(["residential", "datacenter", "mobile", "isp"]),
      country: z.string().max(8).optional(),
      city: z.string().max(128).optional(),
      provider: z.string().max(128).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Enforce proxy slot limit
      await enforceProxySlotLimit(ctx.user.id);
      const proxy = await addProxy(ctx.user.id, input);
      return { ...proxy, password: proxy.password ? "***" : null };
    }),

  addProxyFromUrl: protectedProcedure
    .input(z.object({
      url: z.string().min(1),
      label: z.string().min(1).max(128),
      proxyType: z.enum(["residential", "datacenter", "mobile", "isp"]),
      provider: z.string().max(128).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Enforce proxy slot limit
      await enforceProxySlotLimit(ctx.user.id);

      const parsed = parseProxyUrl(input.url);
      if (!parsed) throw new Error("Invalid proxy URL format. Use protocol://user:pass@host:port or host:port:user:pass");

      const proxy = await addProxy(ctx.user.id, {
        label: input.label,
        protocol: parsed.protocol,
        host: parsed.host,
        port: parsed.port,
        username: parsed.username,
        password: parsed.password,
        proxyType: input.proxyType,
        provider: input.provider,
      });
      return { ...proxy, password: proxy.password ? "***" : null };
    }),

  updateProxy: protectedProcedure
    .input(z.object({
      proxyId: z.number(),
      label: z.string().min(1).max(128).optional(),
      protocol: z.enum(["http", "https", "socks5"]).optional(),
      host: z.string().min(1).max(256).optional(),
      port: z.number().min(1).max(65535).optional(),
      username: z.string().max(128).nullable().optional(),
      password: z.string().nullable().optional(),
      proxyType: z.enum(["residential", "datacenter", "mobile", "isp"]).optional(),
      country: z.string().max(8).nullable().optional(),
      city: z.string().max(128).nullable().optional(),
      provider: z.string().max(128).nullable().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { proxyId, ...data } = input;
      const proxy = await updateProxy(proxyId, ctx.user.id, data);
      if (!proxy) throw new Error("Proxy not found");
      return { ...proxy, password: proxy.password ? "***" : null };
    }),

  deleteProxy: protectedProcedure
    .input(z.object({ proxyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteProxy(input.proxyId, ctx.user.id);
      return { success: true };
    }),

  testProxy: protectedProcedure
    .input(z.object({ proxyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const result = await testAndUpdateProxy(input.proxyId, ctx.user.id);
      return result;
    }),

  // ─── Proxy Info ───────────────────────────────────────────────
  proxyRequirements: protectedProcedure.query(() => {
    return PROVIDER_PROXY_REQUIREMENTS;
  }),

  recommendedProxyProviders: protectedProcedure.query(() => {
    return RECOMMENDED_PROXY_PROVIDERS;
  }),

  // ─── Kill Switch (gated: Pro+ only) ──────────────────────────
  getKillSwitch: protectedProcedure.query(async ({ ctx }) => {
    const plan = await getUserPlan(ctx.user.id);
    const ks = await getOrCreateKillSwitch(ctx.user.id);
    return {
      code: ks.code,
      active: ks.active === 1,
      locked: plan.planId === "free",
      currentPlan: plan.planId,
    };
  }),

  activateKillSwitch: protectedProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await getUserPlan(ctx.user.id);
      enforceFeature(plan.planId, "kill_switch", "Kill Switch");
      const success = await activateKillSwitch(ctx.user.id, input.code);
      if (!success) throw new Error("Invalid kill switch code");
      return { success: true, active: true };
    }),

  deactivateKillSwitch: protectedProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Always allow deactivation even on free plan (safety)
      const success = await deactivateKillSwitch(ctx.user.id, input.code);
      if (!success) throw new Error("Invalid kill switch code");
      return { success: true, active: false };
    }),

  resetKillSwitch: protectedProcedure
    .mutation(async ({ ctx }) => {
      const plan = await getUserPlan(ctx.user.id);
      enforceFeature(plan.planId, "kill_switch", "Kill Switch");
      const newCode = await resetKillSwitch(ctx.user.id);
      return { code: newCode, active: false };
    }),

  // ─── Pre-flight Check Endpoint ─────────────────────────────────
  preflight: protectedProcedure
    .input(z.object({
      providers: z.array(z.string()).min(1),
    }))
    .query(async ({ ctx, input }) => {
      const settings = await getSettings(ctx.user.id);
      const killed = await isKillSwitchActive(ctx.user.id);
      const proxies = await getProxies(ctx.user.id);

      return runPreflightChecks({
        providers: input.providers,
        hasProxy: !!(settings.proxyServer) || proxies.length > 0,
        hasCaptchaSolver: !!(settings.captchaService && settings.captchaApiKey),
        isKillSwitchActive: killed,
        concurrentJobs: getActiveJobCount(ctx.user.id),
      });
    }),

  // ─── System Health Endpoint ────────────────────────────────────
  systemHealth: protectedProcedure.query(async () => {
    return getSystemHealth();
  }),

  // ─── Provider Health Dashboard Endpoints ───────────────────────
  providerHealth: protectedProcedure.query(async ({ ctx }) => {
    const circuitSummary = getCircuitBreakerSummary();
    const allProviders = Object.values(PROVIDERS);
    const proxyReqs = PROVIDER_PROXY_REQUIREMENTS;

    // Get job stats per provider from database
    const db = (await import("./db")).getDb;
    const database = await db();
    let providerStats: Record<string, { total: number; completed: number; failed: number }> = {};

    if (database) {
      const { fetcherTasks } = await import("../drizzle/schema");
      const { eq: eqOp } = await import("drizzle-orm");
      const tasks = await database
        .select({
          providerId: fetcherTasks.providerId,
          status: fetcherTasks.status,
        })
        .from(fetcherTasks)
        .innerJoin(
          fetcherJobs,
          eqOp(fetcherTasks.jobId, fetcherJobs.id)
        )
        .where(eqOp(fetcherJobs.userId, ctx.user.id));

      for (const task of tasks) {
        if (!providerStats[task.providerId]) {
          providerStats[task.providerId] = { total: 0, completed: 0, failed: 0 };
        }
        providerStats[task.providerId].total++;
        if (task.status === "completed") providerStats[task.providerId].completed++;
        if (task.status === "failed") providerStats[task.providerId].failed++;
      }
    }

    return allProviders.map((provider) => {
      const circuit = circuitSummary[provider.id] || { state: "closed", failures: 0 };
      const stats = providerStats[provider.id] || { total: 0, completed: 0, failed: 0 };
      const successRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : null;
      const proxyReq = proxyReqs[provider.id];

      let healthStatus: "healthy" | "degraded" | "down" | "unknown" = "unknown";
      if (circuit.state === "open") {
        healthStatus = "down";
      } else if (circuit.state === "half_open" || circuit.failures > 0) {
        healthStatus = "degraded";
      } else if (stats.total > 0) {
        healthStatus = successRate !== null && successRate >= 70 ? "healthy" : "degraded";
      }

      return {
        id: provider.id,
        name: provider.name,
        category: provider.category,
        healthStatus,
        circuitState: circuit.state,
        consecutiveFailures: circuit.failures,
        totalFetches: stats.total,
        successfulFetches: stats.completed,
        failedFetches: stats.failed,
        successRate,
        requiresProxy: proxyReq?.requiresProxy || false,
        proxyNote: proxyReq?.reason || provider.proxyNote,
      };
    });
  }),

  // ─── Reset Circuit Breaker (admin or owner action) ─────────────
  resetProviderCircuit: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .mutation(async ({ input }) => {
      resetCircuitBreaker(input.providerId);
      return { success: true, providerId: input.providerId };
    }),
});
