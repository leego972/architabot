import { z } from "zod";
import { eq, and, desc, lte, gte, sql, asc } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  syncSchedules,
  fetchRecommendations,
  providerHealthSnapshots,
  fetcherCredentials,
  fetcherJobs,
  fetcherTasks,
  bulkSyncJobs,
} from "../drizzle/schema";
import { PROVIDERS } from "../shared/fetcher";
import { invokeLLM } from "./_core/llm";
import { getUserOpenAIKey } from "./user-secrets-router";
import { createLogger } from "./_core/logger.js";
const log = createLogger("V3FeaturesRouter");

// ─── Feature 1: Scheduled Auto-Sync ────────────────────────────────

export const schedulerRouter = router({
  /**
   * List all sync schedules for the current user.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(syncSchedules)
      .where(eq(syncSchedules.userId, ctx.user.id))
      .orderBy(desc(syncSchedules.createdAt));
  }),

  /**
   * Create a new sync schedule.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        frequency: z.enum(["daily", "weekly", "biweekly", "monthly"]),
        dayOfWeek: z.number().min(0).max(6).optional(),
        timeOfDay: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format"),
        timezone: z.string().default("UTC"),
        providerIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Validate provider IDs
      for (const pid of input.providerIds) {
        if (!PROVIDERS[pid]) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown provider: ${pid}` });
        }
      }

      // Require dayOfWeek for weekly/biweekly
      if ((input.frequency === "weekly" || input.frequency === "biweekly") && input.dayOfWeek === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "dayOfWeek is required for weekly/biweekly schedules" });
      }

      // Calculate next run time
      const nextRunAt = calculateNextRun(input.frequency, input.timeOfDay, input.timezone, input.dayOfWeek);

      const result = await db.insert(syncSchedules).values({
        userId: ctx.user.id,
        name: input.name,
        frequency: input.frequency,
        dayOfWeek: input.dayOfWeek ?? null,
        timeOfDay: input.timeOfDay,
        timezone: input.timezone,
        providerIds: input.providerIds,
        enabled: 1,
        nextRunAt,
      });

      return { success: true, id: Number(result[0].insertId) };
    }),

  /**
   * Update an existing sync schedule.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        frequency: z.enum(["daily", "weekly", "biweekly", "monthly"]).optional(),
        dayOfWeek: z.number().min(0).max(6).optional(),
        timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        timezone: z.string().optional(),
        providerIds: z.array(z.string()).min(1).optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const existing = await db
        .select()
        .from(syncSchedules)
        .where(and(eq(syncSchedules.id, input.id), eq(syncSchedules.userId, ctx.user.id)))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      }

      const current = existing[0];
      const updates: Record<string, unknown> = {};

      if (input.name !== undefined) updates.name = input.name;
      if (input.frequency !== undefined) updates.frequency = input.frequency;
      if (input.dayOfWeek !== undefined) updates.dayOfWeek = input.dayOfWeek;
      if (input.timeOfDay !== undefined) updates.timeOfDay = input.timeOfDay;
      if (input.timezone !== undefined) updates.timezone = input.timezone;
      if (input.providerIds !== undefined) updates.providerIds = input.providerIds;
      if (input.enabled !== undefined) updates.enabled = input.enabled ? 1 : 0;

      // Recalculate next run if schedule parameters changed
      const freq = (input.frequency ?? current.frequency) as "daily" | "weekly" | "biweekly" | "monthly";
      const time = input.timeOfDay ?? current.timeOfDay;
      const tz = input.timezone ?? current.timezone;
      const dow = input.dayOfWeek ?? current.dayOfWeek ?? undefined;
      updates.nextRunAt = calculateNextRun(freq, time, tz, dow);

      await db
        .update(syncSchedules)
        .set(updates)
        .where(eq(syncSchedules.id, input.id));

      return { success: true };
    }),

  /**
   * Delete a sync schedule.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db
        .delete(syncSchedules)
        .where(and(eq(syncSchedules.id, input.id), eq(syncSchedules.userId, ctx.user.id)));

      return { success: true };
    }),

  /**
   * Toggle a schedule on/off.
   */
  toggle: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const existing = await db
        .select()
        .from(syncSchedules)
        .where(and(eq(syncSchedules.id, input.id), eq(syncSchedules.userId, ctx.user.id)))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      }

      const newEnabled = existing[0].enabled === 1 ? 0 : 1;
      const updates: Record<string, unknown> = { enabled: newEnabled };

      // Recalculate next run when re-enabling
      if (newEnabled === 1) {
        const s = existing[0];
        updates.nextRunAt = calculateNextRun(
          s.frequency as "daily" | "weekly" | "biweekly" | "monthly",
          s.timeOfDay,
          s.timezone,
          s.dayOfWeek ?? undefined
        );
      }

      await db
        .update(syncSchedules)
        .set(updates)
        .where(eq(syncSchedules.id, input.id));

      return { success: true, enabled: newEnabled === 1 };
    }),

  /**
   * Get run history summary for a schedule.
   */
  runHistory: protectedProcedure
    .input(z.object({ scheduleId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      // Get bulk sync jobs triggered by this schedule
      const schedule = await db
        .select()
        .from(syncSchedules)
        .where(and(eq(syncSchedules.id, input.scheduleId), eq(syncSchedules.userId, ctx.user.id)))
        .limit(1);

      if (schedule.length === 0) return [];

      // Return the schedule's stats
      return {
        totalRuns: schedule[0].totalRuns,
        successfulRuns: schedule[0].successfulRuns,
        failedRuns: schedule[0].failedRuns,
        lastRunAt: schedule[0].lastRunAt,
        lastRunStatus: schedule[0].lastRunStatus,
        nextRunAt: schedule[0].nextRunAt,
      };
    }),

  /**
   * Manually trigger a scheduled sync immediately.
   */
  triggerNow: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const schedule = await db
        .select()
        .from(syncSchedules)
        .where(and(eq(syncSchedules.id, input.id), eq(syncSchedules.userId, ctx.user.id)))
        .limit(1);

      if (schedule.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      }

      const s = schedule[0];

      // Create a bulk sync job for this schedule's providers
      const result = await db.insert(bulkSyncJobs).values({
        userId: ctx.user.id,
        totalProviders: s.providerIds.length,
        status: "queued",
        triggeredBy: "scheduled",
        linkedJobIds: [],
      });

      const jobId = Number(result[0].insertId);

      // Update schedule's last run info
      await db
        .update(syncSchedules)
        .set({
          lastRunAt: new Date(),
          lastRunJobId: jobId,
          totalRuns: sql`${syncSchedules.totalRuns} + 1`,
          nextRunAt: calculateNextRun(
            s.frequency as "daily" | "weekly" | "biweekly" | "monthly",
            s.timeOfDay,
            s.timezone,
            s.dayOfWeek ?? undefined
          ),
        })
        .where(eq(syncSchedules.id, input.id));

      return { success: true, jobId, providers: s.providerIds };
    }),
});

// ─── Feature 2: Smart Fetch Recommendations ────────────────────────

export const recommendationsRouter = router({
  /**
   * Get active recommendations for the current user.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(fetchRecommendations)
      .where(
        and(
          eq(fetchRecommendations.userId, ctx.user.id),
          eq(fetchRecommendations.dismissed, 0)
        )
      )
      .orderBy(
        sql`FIELD(${fetchRecommendations.priority}, 'critical', 'high', 'medium', 'low')`,
        desc(fetchRecommendations.createdAt)
      );
  }),

  /**
   * Dismiss a recommendation.
   */
  dismiss: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db
        .update(fetchRecommendations)
        .set({ dismissed: 1 })
        .where(and(eq(fetchRecommendations.id, input.id), eq(fetchRecommendations.userId, ctx.user.id)));

      return { success: true };
    }),

  /**
   * Generate fresh recommendations using AI analysis of the user's credential data.
   */
  generate: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const userApiKey = await getUserOpenAIKey(ctx.user.id) || undefined;

    // Gather user's credential data for analysis
    const credentials = await db
      .select({
        id: fetcherCredentials.id,
        providerId: fetcherCredentials.providerId,
        keyType: fetcherCredentials.keyType,
        createdAt: fetcherCredentials.createdAt,
      })
      .from(fetcherCredentials)
      .where(eq(fetcherCredentials.userId, ctx.user.id));

    // Get recent job history
    const recentJobs = await db
      .select({
        id: fetcherJobs.id,
        status: fetcherJobs.status,
        completedProviders: fetcherJobs.completedProviders,
        failedProviders: fetcherJobs.failedProviders,
        createdAt: fetcherJobs.createdAt,
      })
      .from(fetcherJobs)
      .where(eq(fetcherJobs.userId, ctx.user.id))
      .orderBy(desc(fetcherJobs.createdAt))
      .limit(20);

    // Get recent task results per provider
    const recentTasks = await db
      .select({
        providerId: fetcherTasks.providerId,
        status: fetcherTasks.status,
        errorMessage: fetcherTasks.errorMessage,
        createdAt: fetcherTasks.createdAt,
      })
      .from(fetcherTasks)
      .where(
        sql`${fetcherTasks.jobId} IN (SELECT id FROM fetcher_jobs WHERE userId = ${ctx.user.id})`
      )
      .orderBy(desc(fetcherTasks.createdAt))
      .limit(50);

    // Build analysis context
    const now = Date.now();
    const providerStats: Record<string, {
      totalFetches: number;
      successes: number;
      failures: number;
      lastFetchedAt: number | null;
      daysSinceLastFetch: number | null;
      errorMessages: string[];
    }> = {};

    for (const cred of credentials) {
      if (!providerStats[cred.providerId]) {
        providerStats[cred.providerId] = {
          totalFetches: 0, successes: 0, failures: 0,
          lastFetchedAt: null, daysSinceLastFetch: null, errorMessages: [],
        };
      }
      const stat = providerStats[cred.providerId];
      if (cred.createdAt) {
        const fetchTime = new Date(cred.createdAt).getTime();
        if (!stat.lastFetchedAt || fetchTime > stat.lastFetchedAt) {
          stat.lastFetchedAt = fetchTime;
          stat.daysSinceLastFetch = Math.floor((now - fetchTime) / (24 * 60 * 60 * 1000));
        }
      }
    }

    for (const task of recentTasks) {
      if (!providerStats[task.providerId]) {
        providerStats[task.providerId] = {
          totalFetches: 0, successes: 0, failures: 0,
          lastFetchedAt: null, daysSinceLastFetch: null, errorMessages: [],
        };
      }
      const stat = providerStats[task.providerId];
      stat.totalFetches++;
      if (task.status === "completed") stat.successes++;
      if (task.status === "failed") {
        stat.failures++;
        if (task.errorMessage) stat.errorMessages.push(task.errorMessage);
      }
    }

    // Find providers user hasn't tried
    const usedProviderIds = new Set(Object.keys(providerStats));
    const unusedProviders = Object.keys(PROVIDERS).filter(pid => !usedProviderIds.has(pid));

    // Use LLM to generate smart recommendations
    const analysisPrompt = `You are an AI assistant for Archibald Titan, a credential management tool. Analyze the user's credential data and generate actionable recommendations.

User's provider statistics:
${JSON.stringify(providerStats, null, 2)}

Providers the user hasn't tried yet: ${unusedProviders.join(", ")}

Available provider details:
${Object.entries(PROVIDERS).map(([id, p]) => `- ${id}: ${p.name} (${p.category}) - ${p.description}${p.requiresResidentialProxy ? " [REQUIRES PROXY]" : ""}`).join("\n")}

Generate 3-5 recommendations as a JSON array. Each recommendation must have:
- providerId: the provider this recommendation is about
- recommendationType: one of "stale_credential", "rotation_detected", "high_failure_rate", "optimal_time", "new_provider", "proxy_needed"
- title: short actionable title (max 100 chars)
- description: detailed explanation (max 300 chars)
- priority: "low", "medium", "high", or "critical"
- actionUrl: deep link path in the app (e.g., "/fetcher/new" for new fetch, "/fetcher/credentials" for viewing credentials)

Rules:
- If a credential hasn't been refreshed in 30+ days, mark as "stale_credential" with high priority
- If a provider has >50% failure rate, mark as "high_failure_rate" with high priority
- If a provider requires proxy and user has failures, mark as "proxy_needed"
- Suggest 1-2 unused providers that complement what the user already uses
- Be specific and actionable in descriptions

Return ONLY a valid JSON array, no other text.`;

    try {
      const response = await invokeLLM({
        systemTag: "misc",
        userApiKey,
        messages: [
          { role: "system", content: "You are a JSON-only response bot. Return only valid JSON arrays." },
          { role: "user", content: analysisPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "recommendations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      providerId: { type: "string" },
                      recommendationType: { type: "string", enum: ["stale_credential", "rotation_detected", "high_failure_rate", "optimal_time", "new_provider", "proxy_needed"] },
                      title: { type: "string" },
                      description: { type: "string" },
                      priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                      actionUrl: { type: "string" },
                    },
                    required: ["providerId", "recommendationType", "title", "description", "priority", "actionUrl"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["recommendations"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new Error("Empty LLM response");
      }

      const parsed = JSON.parse(content);
      const recs = parsed.recommendations || parsed;

      if (!Array.isArray(recs)) {
        throw new Error("Invalid recommendations format");
      }

      // Clear old non-dismissed recommendations
      await db
        .delete(fetchRecommendations)
        .where(
          and(
            eq(fetchRecommendations.userId, ctx.user.id),
            eq(fetchRecommendations.dismissed, 0)
          )
        );

      // Insert new recommendations
      const validTypes = ["stale_credential", "rotation_detected", "high_failure_rate", "optimal_time", "new_provider", "proxy_needed"] as const;
      const validPriorities = ["low", "medium", "high", "critical"] as const;

      let inserted = 0;
      for (const rec of recs.slice(0, 5)) {
        const recType = validTypes.includes(rec.recommendationType) ? rec.recommendationType : "stale_credential";
        const recPriority = validPriorities.includes(rec.priority) ? rec.priority : "medium";

        await db.insert(fetchRecommendations).values({
          userId: ctx.user.id,
          providerId: rec.providerId || "unknown",
          recommendationType: recType,
          title: (rec.title || "Review your credentials").slice(0, 256),
          description: (rec.description || "Check your credential status.").slice(0, 1000),
          priority: recPriority,
          actionUrl: rec.actionUrl || "/fetcher/credentials",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // expire in 7 days
          metadata: { generatedBy: "ai", generatedAt: new Date().toISOString() },
        });
        inserted++;
      }

      return { success: true, count: inserted };
    } catch (error) {
      log.error("[SmartFetch] LLM recommendation generation failed:", { error: String(error) });

      // Fallback: generate rule-based recommendations without LLM
      let inserted = 0;

      // Check for stale credentials (30+ days)
      for (const [pid, stat] of Object.entries(providerStats)) {
        if (stat.daysSinceLastFetch && stat.daysSinceLastFetch > 30) {
          await db.insert(fetchRecommendations).values({
            userId: ctx.user.id,
            providerId: pid,
            recommendationType: "stale_credential",
            title: `Refresh ${PROVIDERS[pid]?.name || pid} credentials`,
            description: `Your ${PROVIDERS[pid]?.name || pid} credentials haven't been refreshed in ${stat.daysSinceLastFetch} days. API keys may have been rotated upstream.`,
            priority: stat.daysSinceLastFetch > 60 ? "high" : "medium",
            actionUrl: "/fetcher/new",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            metadata: { generatedBy: "rules", daysSinceLastFetch: stat.daysSinceLastFetch },
          });
          inserted++;
        }

        // High failure rate
        if (stat.totalFetches >= 3 && stat.failures / stat.totalFetches > 0.5) {
          await db.insert(fetchRecommendations).values({
            userId: ctx.user.id,
            providerId: pid,
            recommendationType: "high_failure_rate",
            title: `${PROVIDERS[pid]?.name || pid} has high failure rate`,
            description: `${stat.failures}/${stat.totalFetches} recent fetches failed. ${PROVIDERS[pid]?.requiresResidentialProxy ? "This provider requires a residential proxy." : "Check your credentials and try again."}`,
            priority: "high",
            actionUrl: "/fetcher/provider-health",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            metadata: { generatedBy: "rules", failureRate: stat.failures / stat.totalFetches },
          });
          inserted++;
        }
      }

      // Suggest one unused provider
      if (unusedProviders.length > 0) {
        const suggested = unusedProviders[0];
        const provider = PROVIDERS[suggested];
        if (provider) {
          await db.insert(fetchRecommendations).values({
            userId: ctx.user.id,
            providerId: suggested,
            recommendationType: "new_provider",
            title: `Try ${provider.name}`,
            description: `You haven't fetched credentials from ${provider.name} yet. ${provider.description}`,
            priority: "low",
            actionUrl: "/fetcher/new",
            expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            metadata: { generatedBy: "rules" },
          });
          inserted++;
        }
      }

      return { success: true, count: inserted, fallback: true };
    }
  }),

  /**
   * Get recommendation summary counts.
   */
  summary: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { total: 0, critical: 0, high: 0, medium: 0, low: 0 };

    const recs = await db
      .select({
        priority: fetchRecommendations.priority,
        count: sql<number>`COUNT(*)`,
      })
      .from(fetchRecommendations)
      .where(
        and(
          eq(fetchRecommendations.userId, ctx.user.id),
          eq(fetchRecommendations.dismissed, 0)
        )
      )
      .groupBy(fetchRecommendations.priority);

    const counts: Record<string, number> = {};
    for (const r of recs) {
      counts[r.priority] = Number(r.count);
    }

    return {
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      critical: counts["critical"] ?? 0,
      high: counts["high"] ?? 0,
      medium: counts["medium"] ?? 0,
      low: counts["low"] ?? 0,
    };
  }),
});

// ─── Feature 3: Provider Health Trends ──────────────────────────────

export const healthTrendsRouter = router({
  /**
   * Get health trend data for a specific provider over time.
   */
  getProviderTrend: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        days: z.number().min(7).max(90).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      return db
        .select()
        .from(providerHealthSnapshots)
        .where(
          and(
            eq(providerHealthSnapshots.userId, ctx.user.id),
            eq(providerHealthSnapshots.providerId, input.providerId),
            gte(providerHealthSnapshots.snapshotDate, since)
          )
        )
        .orderBy(asc(providerHealthSnapshots.snapshotDate));
    }),

  /**
   * Get aggregated health overview for all providers.
   */
  overview: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const snapshots = await db
        .select({
          providerId: providerHealthSnapshots.providerId,
          totalFetches: sql<number>`SUM(${providerHealthSnapshots.totalFetches})`,
          successfulFetches: sql<number>`SUM(${providerHealthSnapshots.successfulFetches})`,
          failedFetches: sql<number>`SUM(${providerHealthSnapshots.failedFetches})`,
          avgDuration: sql<number>`AVG(${providerHealthSnapshots.avgDurationMs})`,
          dataPoints: sql<number>`COUNT(*)`,
        })
        .from(providerHealthSnapshots)
        .where(
          and(
            eq(providerHealthSnapshots.userId, ctx.user.id),
            gte(providerHealthSnapshots.snapshotDate, since)
          )
        )
        .groupBy(providerHealthSnapshots.providerId);

      return snapshots.map((s) => ({
        providerId: s.providerId,
        providerName: PROVIDERS[s.providerId]?.name ?? s.providerId,
        totalFetches: Number(s.totalFetches),
        successfulFetches: Number(s.successfulFetches),
        failedFetches: Number(s.failedFetches),
        successRate: Number(s.totalFetches) > 0
          ? Math.round((Number(s.successfulFetches) / Number(s.totalFetches)) * 100)
          : 0,
        avgDurationMs: Math.round(Number(s.avgDuration) || 0),
        dataPoints: Number(s.dataPoints),
      }));
    }),

  /**
   * Record a health snapshot (called after job completion).
   */
  recordSnapshot: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        totalFetches: z.number().min(0),
        successfulFetches: z.number().min(0),
        failedFetches: z.number().min(0),
        avgDurationMs: z.number().min(0).optional(),
        circuitState: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if snapshot already exists for today
      const existing = await db
        .select({ id: providerHealthSnapshots.id })
        .from(providerHealthSnapshots)
        .where(
          and(
            eq(providerHealthSnapshots.userId, ctx.user.id),
            eq(providerHealthSnapshots.providerId, input.providerId),
            eq(providerHealthSnapshots.snapshotDate, today)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing snapshot (aggregate)
        await db
          .update(providerHealthSnapshots)
          .set({
            totalFetches: sql`${providerHealthSnapshots.totalFetches} + ${input.totalFetches}`,
            successfulFetches: sql`${providerHealthSnapshots.successfulFetches} + ${input.successfulFetches}`,
            failedFetches: sql`${providerHealthSnapshots.failedFetches} + ${input.failedFetches}`,
            avgDurationMs: input.avgDurationMs ?? null,
            circuitState: input.circuitState ?? null,
          })
          .where(eq(providerHealthSnapshots.id, existing[0].id));
      } else {
        // Create new snapshot
        await db.insert(providerHealthSnapshots).values({
          userId: ctx.user.id,
          providerId: input.providerId,
          totalFetches: input.totalFetches,
          successfulFetches: input.successfulFetches,
          failedFetches: input.failedFetches,
          avgDurationMs: input.avgDurationMs ?? null,
          circuitState: input.circuitState ?? null,
          snapshotDate: today,
        });
      }

      return { success: true };
    }),

  /**
   * Get daily trend data across all providers for charting.
   */
  dailyTrend: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const results = await db
        .select({
          date: providerHealthSnapshots.snapshotDate,
          totalFetches: sql<number>`SUM(${providerHealthSnapshots.totalFetches})`,
          successfulFetches: sql<number>`SUM(${providerHealthSnapshots.successfulFetches})`,
          failedFetches: sql<number>`SUM(${providerHealthSnapshots.failedFetches})`,
        })
        .from(providerHealthSnapshots)
        .where(
          and(
            eq(providerHealthSnapshots.userId, ctx.user.id),
            gte(providerHealthSnapshots.snapshotDate, since)
          )
        )
        .groupBy(providerHealthSnapshots.snapshotDate)
        .orderBy(asc(providerHealthSnapshots.snapshotDate));

      return results.map((r) => ({
        date: r.date,
        totalFetches: Number(r.totalFetches),
        successfulFetches: Number(r.successfulFetches),
        failedFetches: Number(r.failedFetches),
        successRate: Number(r.totalFetches) > 0
          ? Math.round((Number(r.successfulFetches) / Number(r.totalFetches)) * 100)
          : 0,
      }));
    }),
});

// ─── Helper: Calculate Next Run Time ────────────────────────────────

function calculateNextRun(
  frequency: "daily" | "weekly" | "biweekly" | "monthly",
  timeOfDay: string,
  timezone: string,
  dayOfWeek?: number
): Date {
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  const now = new Date();

  // Start from today at the specified time
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);

  // If the time has already passed today, move to next occurrence
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  switch (frequency) {
    case "daily":
      // Already set to next occurrence
      break;

    case "weekly":
      if (dayOfWeek !== undefined) {
        while (next.getDay() !== dayOfWeek) {
          next.setDate(next.getDate() + 1);
        }
      }
      break;

    case "biweekly":
      if (dayOfWeek !== undefined) {
        while (next.getDay() !== dayOfWeek) {
          next.setDate(next.getDate() + 1);
        }
        // Ensure it's at least 14 days from now if within the same week
        const daysUntil = Math.ceil((next.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        if (daysUntil < 7) {
          next.setDate(next.getDate() + 14);
        }
      }
      break;

    case "monthly":
      // Run on the 1st of next month
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      break;
  }

  return next;
}
