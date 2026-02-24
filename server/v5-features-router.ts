/**
 * V5.0 Features Router — Developer API, Webhooks, Rate Limiting, Usage Analytics
 */

import { z } from "zod";
import { eq, and, desc, sql, gte, isNull } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  webhooks,
  webhookDeliveryLogs,
  apiUsageLogs,
  apiKeys,
} from "../drizzle/schema";
import { getUserPlan, enforceFeature } from "./subscription-gate";
import { logAudit } from "./audit-log-db";
import crypto from "crypto";

// ─── Webhook Event Types ─────────────────────────────────────────
export const WEBHOOK_EVENT_TYPES = [
  "credential.created",
  "credential.rotated",
  "credential.expired",
  "scan.started",
  "scan.completed",
  "scan.leak_found",
  "vault.item_added",
  "vault.item_accessed",
  "vault.item_expired",
  "job.completed",
  "job.failed",
  "team.member_joined",
  "team.member_removed",
] as const;

// ─── Rate Limits by Plan ─────────────────────────────────────────
const RATE_LIMITS: Record<string, number> = {
  free: 0,
  pro: 100,
  enterprise: 10000,
};

// ─── Helpers ─────────────────────────────────────────────────────

function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("hex")}`;
}

// ═══════════════════════════════════════════════════════════════════
// Webhook Management Router
// ═══════════════════════════════════════════════════════════════════

export const webhookRouter = router({
  /** List all webhooks for the current user */
  list: protectedProcedure.query(async ({ ctx }) => {
    const plan = await getUserPlan(ctx.user.id);
    enforceFeature(plan.planId, "webhooks", "Webhook Integrations");

    const db = await getDb();
    if (!db) return [];

    return db
      .select()
      .from(webhooks)
      .where(eq(webhooks.userId, ctx.user.id))
      .orderBy(desc(webhooks.createdAt));
  }),

  /** Create a new webhook */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        url: z.string().url().max(2048),
        events: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await getUserPlan(ctx.user.id);
      enforceFeature(plan.planId, "webhooks", "Webhook Integrations");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Limit to 10 webhooks
      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(webhooks)
        .where(eq(webhooks.userId, ctx.user.id));

      if (countResult[0].count >= 10) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Maximum of 10 webhooks allowed. Delete an existing one first.",
        });
      }

      const secret = generateWebhookSecret();

      await db.insert(webhooks).values({
        userId: ctx.user.id,
        name: input.name,
        url: input.url,
        secret,
        events: input.events,
      });

      await logAudit({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        userEmail: ctx.user.email || undefined,
        action: "webhook.create",
        resource: "webhook",
        details: { name: input.name, events: input.events },
      });

      return { success: true, secret };
    }),

  /** Update a webhook */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        url: z.string().url().max(2048).optional(),
        events: z.array(z.string()).min(1).optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.url !== undefined) updates.url = input.url;
      if (input.events !== undefined) updates.events = input.events;
      if (input.active !== undefined) updates.active = input.active ? 1 : 0;

      await db
        .update(webhooks)
        .set(updates)
        .where(and(eq(webhooks.id, input.id), eq(webhooks.userId, ctx.user.id)));

      return { success: true };
    }),

  /** Delete a webhook */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .delete(webhooks)
        .where(and(eq(webhooks.id, input.id), eq(webhooks.userId, ctx.user.id)));

      await logAudit({
        userId: ctx.user.id,
        userName: ctx.user.name || undefined,
        userEmail: ctx.user.email || undefined,
        action: "webhook.delete",
        resource: "webhook",
        resourceId: input.id.toString(),
      });

      return { success: true };
    }),

  /** Rotate webhook secret */
  rotateSecret: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const newSecret = generateWebhookSecret();

      await db
        .update(webhooks)
        .set({ secret: newSecret })
        .where(and(eq(webhooks.id, input.id), eq(webhooks.userId, ctx.user.id)));

      return { secret: newSecret };
    }),

  /** Test a webhook by sending a test event */
  test: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const hook = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, input.id), eq(webhooks.userId, ctx.user.id)))
        .limit(1);

      if (hook.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }

      const testPayload = {
        event: "test.ping",
        timestamp: new Date().toISOString(),
        data: { message: "This is a test event from Archibald Titan" },
      };

      const signature = crypto
        .createHmac("sha256", hook[0].secret)
        .update(JSON.stringify(testPayload))
        .digest("hex");

      try {
        const start = Date.now();
        const response = await fetch(hook[0].url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Titan-Signature": signature,
            "X-Titan-Event": "test.ping",
          },
          body: JSON.stringify(testPayload),
          signal: AbortSignal.timeout(10000),
        });
        const responseMs = Date.now() - start;

        // Log delivery
        await db.insert(webhookDeliveryLogs).values({
          webhookId: hook[0].id,
          userId: ctx.user.id,
          eventType: "test.ping",
          payload: testPayload,
          statusCode: response.status,
          responseMs,
          success: response.ok ? 1 : 0,
          errorMessage: response.ok ? null : `HTTP ${response.status}`,
        });

        // Update webhook stats
        await db
          .update(webhooks)
          .set({
            lastDeliveredAt: new Date(),
            lastStatusCode: response.status,
            ...(response.ok
              ? { successCount: sql`${webhooks.successCount} + 1` }
              : { failCount: sql`${webhooks.failCount} + 1` }),
          })
          .where(eq(webhooks.id, hook[0].id));

        return { success: response.ok, statusCode: response.status, responseMs };
      } catch (err: unknown) {
        await db.insert(webhookDeliveryLogs).values({
          webhookId: hook[0].id,
          userId: ctx.user.id,
          eventType: "test.ping",
          payload: testPayload,
          success: 0,
          errorMessage: getErrorMessage(err) || "Connection failed",
        });

        await db
          .update(webhooks)
          .set({ failCount: sql`${webhooks.failCount} + 1` })
          .where(eq(webhooks.id, hook[0].id));

        return { success: false, error: getErrorMessage(err) || "Connection failed" };
      }
    }),

  /** Get delivery logs for a webhook */
  deliveryLogs: protectedProcedure
    .input(z.object({ webhookId: z.number(), limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(webhookDeliveryLogs)
        .where(
          and(
            eq(webhookDeliveryLogs.webhookId, input.webhookId),
            eq(webhookDeliveryLogs.userId, ctx.user.id)
          )
        )
        .orderBy(desc(webhookDeliveryLogs.createdAt))
        .limit(input.limit);
    }),

  /** Get available event types */
  eventTypes: protectedProcedure.query(() => {
    return WEBHOOK_EVENT_TYPES.map((e) => ({
      id: e,
      label: e
        .split(".")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" → "),
      category: e.split(".")[0],
    }));
  }),
});

// ═══════════════════════════════════════════════════════════════════
// API Usage & Analytics Router
// ═══════════════════════════════════════════════════════════════════

export const apiAnalyticsRouter = router({
  /** Get API usage stats for the current user */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const plan = await getUserPlan(ctx.user.id);
    enforceFeature(plan.planId, "developer_api", "Developer API");

    const db = await getDb();
    if (!db) return { totalRequests: 0, todayRequests: 0, dailyLimit: 0, activeKeys: 0, topEndpoints: [] };

    const dailyLimit = RATE_LIMITS[plan.planId] || 0;

    // Total requests
    const totalResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(apiUsageLogs)
      .where(eq(apiUsageLogs.userId, ctx.user.id));

    // Today's requests
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(apiUsageLogs)
      .where(
        and(
          eq(apiUsageLogs.userId, ctx.user.id),
          gte(apiUsageLogs.createdAt, todayStart)
        )
      );

    // Active keys
    const keysResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, ctx.user.id), isNull(apiKeys.revokedAt)));

    // Top endpoints (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const topEndpoints = await db
      .select({
        endpoint: apiUsageLogs.endpoint,
        count: sql<number>`COUNT(*)`,
      })
      .from(apiUsageLogs)
      .where(
        and(
          eq(apiUsageLogs.userId, ctx.user.id),
          gte(apiUsageLogs.createdAt, thirtyDaysAgo)
        )
      )
      .groupBy(apiUsageLogs.endpoint)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(5);

    return {
      totalRequests: totalResult[0]?.count ?? 0,
      todayRequests: todayResult[0]?.count ?? 0,
      dailyLimit,
      activeKeys: keysResult[0]?.count ?? 0,
      topEndpoints,
    };
  }),

  /** Get daily usage for the last 30 days (for chart) */
  dailyUsage: protectedProcedure.query(async ({ ctx }) => {
    const plan = await getUserPlan(ctx.user.id);
    enforceFeature(plan.planId, "developer_api", "Developer API");

    const db = await getDb();
    if (!db) return [];

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const usage = await db
      .select({
        date: sql<string>`DATE(${apiUsageLogs.createdAt})`,
        count: sql<number>`COUNT(*)`,
        avgResponseMs: sql<number>`AVG(${apiUsageLogs.responseMs})`,
      })
      .from(apiUsageLogs)
      .where(
        and(
          eq(apiUsageLogs.userId, ctx.user.id),
          gte(apiUsageLogs.createdAt, thirtyDaysAgo)
        )
      )
      .groupBy(sql`DATE(${apiUsageLogs.createdAt})`)
      .orderBy(sql`DATE(${apiUsageLogs.createdAt})`);

    return usage;
  }),

  /** Get recent API requests log */
  recentRequests: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const plan = await getUserPlan(ctx.user.id);
      enforceFeature(plan.planId, "developer_api", "Developer API");

      const db = await getDb();
      if (!db) return [];

      return db
        .select({
          id: apiUsageLogs.id,
          endpoint: apiUsageLogs.endpoint,
          method: apiUsageLogs.method,
          statusCode: apiUsageLogs.statusCode,
          responseMs: apiUsageLogs.responseMs,
          createdAt: apiUsageLogs.createdAt,
        })
        .from(apiUsageLogs)
        .where(eq(apiUsageLogs.userId, ctx.user.id))
        .orderBy(desc(apiUsageLogs.createdAt))
        .limit(input.limit);
    }),

  /** Get rate limit info */
  rateLimit: protectedProcedure.query(async ({ ctx }) => {
    const plan = await getUserPlan(ctx.user.id);
    const dailyLimit = RATE_LIMITS[plan.planId] || 0;

    const db = await getDb();
    if (!db) return { limit: dailyLimit, used: 0, remaining: dailyLimit, plan: plan.planId };

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(apiUsageLogs)
      .where(
        and(
          eq(apiUsageLogs.userId, ctx.user.id),
          gte(apiUsageLogs.createdAt, todayStart)
        )
      );

    const used = todayResult[0]?.count ?? 0;
    return {
      limit: dailyLimit,
      used,
      remaining: Math.max(0, dailyLimit - used),
      plan: plan.planId,
    };
  }),
});

// ═══════════════════════════════════════════════════════════════════
// Expanded REST API Endpoints (for external consumers)
// ═══════════════════════════════════════════════════════════════════

import { Express, Request, Response, NextFunction } from "express";
import { validateApiKey } from "./api-access-router";
import { getDecryptedCredentials, exportCredentials } from "./fetcher-db";
import { getErrorMessage } from "./_core/errors.js";

// Rate limiting middleware
async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).apiKeyUserId;
  const plan = await getUserPlan(userId);
  const dailyLimit = RATE_LIMITS[plan.planId] || 0;

  if (dailyLimit === 0) {
    return res.status(403).json({ error: "API access not available on your plan" });
  }

  const db = await getDb();
  if (!db) return next();

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(apiUsageLogs)
    .where(
      and(
        eq(apiUsageLogs.userId, userId),
        gte(apiUsageLogs.createdAt, todayStart)
      )
    );

  const used = todayResult[0]?.count ?? 0;
  if (used >= dailyLimit) {
    return res.status(429).json({
      error: "Daily API rate limit exceeded",
      limit: dailyLimit,
      used,
      resetAt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  // Set rate limit headers
  res.setHeader("X-RateLimit-Limit", dailyLimit.toString());
  res.setHeader("X-RateLimit-Remaining", (dailyLimit - used - 1).toString());
  res.setHeader("X-RateLimit-Reset", new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString());

  next();
}

// Usage logging middleware
function usageLogMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  res.on("finish", async () => {
    try {
      const db = await getDb();
      if (!db) return;

      const apiKeyId = (req as any).apiKeyId;
      const userId = (req as any).apiKeyUserId;
      if (!userId) return;

      await db.insert(apiUsageLogs).values({
        apiKeyId: apiKeyId || 0,
        userId,
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        responseMs: Date.now() - startTime,
      });
    } catch {
      // Silently fail — don't break the response
    }
  });

  next();
}

export function registerV5ApiRoutes(app: Express) {
  // Auth middleware
  const authenticateApiKey = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
        hint: "Use: Authorization: Bearer <api_key>",
      });
    }

    const rawKey = authHeader.substring(7);
    const apiKey = await validateApiKey(rawKey);
    if (!apiKey) {
      return res.status(401).json({ error: "Invalid or expired API key" });
    }

    (req as any).apiKeyUserId = apiKey.userId;
    (req as any).apiKeyId = apiKey.id;
    (req as any).apiKeyScopes = apiKey.scopes;
    next();
  };

  const requireScope = (scope: string) => (req: Request, res: Response, next: NextFunction) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes(scope)) {
      return res.status(403).json({ error: `Missing required scope: ${scope}` });
    }
    next();
  };

  // Apply middleware chain to all v1 routes
  const apiMiddleware = [authenticateApiKey, rateLimitMiddleware, usageLogMiddleware];

  // ─── GET /api/v1/me — API key info ─────────────────────────────
  app.get("/api/v1/me", ...apiMiddleware, async (req: Request, res: Response) => {
    try {
      const plan = await getUserPlan((req as any).apiKeyUserId);
      const dailyLimit = RATE_LIMITS[plan.planId] || 0;
      res.json({
        userId: (req as any).apiKeyUserId,
        plan: plan.planId,
        scopes: (req as any).apiKeyScopes,
        rateLimit: { daily: dailyLimit },
      });
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── GET /api/v1/credentials — List credentials ─────────────────
  app.get("/api/v1/credentials", ...apiMiddleware, requireScope("credentials:read"), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).apiKeyUserId;
      const creds = await getDecryptedCredentials(userId);
      res.json({
        data: creds.map((c) => ({
          id: c.id,
          provider: c.providerName,
          providerId: c.providerId,
          keyType: c.keyType,
          label: c.keyLabel,
          value: c.value,
          createdAt: c.createdAt,
        })),
        count: creds.length,
      });
    } catch {
      res.status(500).json({ error: "Failed to retrieve credentials" });
    }
  });

  // ─── GET /api/v1/credentials/export — Export credentials ────────
  app.get("/api/v1/credentials/export", ...apiMiddleware, requireScope("credentials:export"), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).apiKeyUserId;
      const format = (req.query.format as string) || "json";
      if (!["json", "env", "csv"].includes(format)) {
        return res.status(400).json({ error: "Invalid format. Use: json, env, or csv" });
      }

      const plan = await getUserPlan(userId);
      const allowedFormats = plan.tier.limits.exportFormats;
      if (!allowedFormats.includes(format)) {
        return res.status(403).json({ error: `${format.toUpperCase()} export not available on your plan` });
      }

      const data = await exportCredentials(userId, format as "json" | "env" | "csv");
      const contentType = format === "json" ? "application/json" : "text/plain";
      res.setHeader("Content-Type", contentType);
      res.send(data);
    } catch {
      res.status(500).json({ error: "Failed to export credentials" });
    }
  });

  // ─── GET /api/v1/vault — List vault items (metadata only) ──────
  app.get("/api/v1/vault", ...apiMiddleware, requireScope("credentials:read"), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).apiKeyUserId;
      const db = await getDb();
      if (!db) return res.json({ data: [], count: 0 });

      const { vaultItems } = await import("../drizzle/schema");
      const items = await db
        .select({
          id: vaultItems.id,
          name: vaultItems.name,
          credentialType: vaultItems.credentialType,
          accessLevel: vaultItems.accessLevel,
          providerId: vaultItems.providerId,
          tags: vaultItems.tags,
          expiresAt: vaultItems.expiresAt,
          createdAt: vaultItems.createdAt,
        })
        .from(vaultItems)
        .where(eq(vaultItems.teamOwnerId, userId));

      res.json({ data: items, count: items.length });
    } catch {
      res.status(500).json({ error: "Failed to retrieve vault items" });
    }
  });

  // ─── GET /api/v1/scans — List leak scans ───────────────────────
  app.get("/api/v1/scans", ...apiMiddleware, requireScope("credentials:read"), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).apiKeyUserId;
      const db = await getDb();
      if (!db) return res.json({ data: [], count: 0 });

      const { leakScans } = await import("../drizzle/schema");
      const scans = await db
        .select()
        .from(leakScans)
        .where(eq(leakScans.userId, userId))
        .orderBy(desc(leakScans.createdAt))
        .limit(50);

      res.json({ data: scans, count: scans.length });
    } catch {
      res.status(500).json({ error: "Failed to retrieve scans" });
    }
  });

  // ─── GET /api/v1/totp — List TOTP entries ──────────────────────
  app.get("/api/v1/totp", ...apiMiddleware, requireScope("totp:read"), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).apiKeyUserId;
      const db = await getDb();
      if (!db) return res.json({ data: [], count: 0 });
      const { totpSecrets } = await import("../drizzle/schema");
      const items = await db.select()
        .from(totpSecrets)
        .where(eq(totpSecrets.userId, userId))
        .orderBy(desc(totpSecrets.createdAt));
      const data = items.map(item => ({
        id: item.id,
        name: item.name,
        issuer: item.issuer,
        algorithm: item.algorithm,
        digits: item.digits,
        period: item.period,
        lastUsedAt: item.lastUsedAt,
        createdAt: item.createdAt,
      }));
      res.json({ data, count: data.length });
    } catch {
      res.status(500).json({ error: "Failed to retrieve TOTP entries" });
    }
  });

  // ─── POST /api/v1/totp/:id/generate — Generate TOTP code ──────
  app.post("/api/v1/totp/:id/generate", ...apiMiddleware, requireScope("totp:generate"), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).apiKeyUserId;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid TOTP ID" });
      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database unavailable" });
      const { totpSecrets } = await import("../drizzle/schema");
      const [item] = await db.select()
        .from(totpSecrets)
        .where(and(eq(totpSecrets.id, id), eq(totpSecrets.userId, userId)))
        .limit(1);
      if (!item) return res.status(404).json({ error: "TOTP entry not found" });
      // Decrypt secret
      const VAULT_KEY = process.env.JWT_SECRET?.slice(0, 32).padEnd(32, "0") || "archibald-titan-vault-key-32char";
      const [ivHex, encrypted] = item.encryptedSecret.split(":");
      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(VAULT_KEY, "utf8"), iv);
      let secret = decipher.update(encrypted, "hex", "utf8");
      secret += decipher.final("utf8");
      // Generate TOTP code
      const now = Math.floor(Date.now() / 1000);
      const period = item.period || 30;
      const counter = Math.floor(now / period);
      const remaining = period - (now % period);
      const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      const cleanSecret = secret.replace(/[\s=-]/g, "").toUpperCase();
      let bits = "";
      for (const ch of cleanSecret) {
        const val = base32Chars.indexOf(ch);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, "0");
      }
      const bytes: number[] = [];
      for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.substring(i, i + 8), 2));
      }
      const key = Buffer.from(bytes);
      const counterBuf = Buffer.alloc(8);
      let tmp = counter;
      for (let i = 7; i >= 0; i--) {
        counterBuf[i] = tmp & 0xff;
        tmp = Math.floor(tmp / 256);
      }
      const alg = (item.algorithm || "SHA1").toLowerCase().replace("-", "");
      const hmac = crypto.createHmac(alg === "sha1" ? "sha1" : alg === "sha256" ? "sha256" : "sha512", key);
      hmac.update(counterBuf);
      const hash = hmac.digest();
      const offset = hash[hash.length - 1] & 0x0f;
      const binary = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16) | ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
      const digits = item.digits || 6;
      const otp = binary % Math.pow(10, digits);
      const code = otp.toString().padStart(digits, "0");
      // Update last used
      await db.update(totpSecrets).set({ lastUsedAt: new Date() }).where(eq(totpSecrets.id, id));
      res.json({ code, remaining, name: item.name, issuer: item.issuer });
    } catch {
      res.status(500).json({ error: "Failed to generate TOTP code" });
    }
  });

  // ─── GET /api/v1/audit — List audit logs ──────────────────────
  app.get("/api/v1/audit", ...apiMiddleware, requireScope("audit:read"), async (req: Request, res: Response) => {
    try {
      const { queryAuditLogs } = await import("./audit-log-db");
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const action = req.query.action as string | undefined;
      const result = await queryAuditLogs({ action, limit, offset });
      res.json(result);
    } catch {
      res.status(500).json({ error: "Failed to retrieve audit logs" });
    }
  });

  // ─── GET /api/v1/audit/export — Export audit logs as CSV ──────
  app.get("/api/v1/audit/export", ...apiMiddleware, requireScope("audit:export"), async (req: Request, res: Response) => {
    try {
      const { queryAuditLogs } = await import("./audit-log-db");
      const limit = Math.min(parseInt(req.query.limit as string) || 1000, 10000);
      const result = await queryAuditLogs({ limit, offset: 0 });
      const header = "ID,Timestamp,User,Action,Resource,Details";
      const rows = result.logs.map((log: any) => {
        const details = typeof log.details === "object" ? JSON.stringify(log.details).replace(/"/g, '""') : (log.details || "");
        return `${log.id},${log.createdAt},"${log.userName || ""}","${log.action}","${log.resource || ""}","${details}"`;
      });
      const csv = [header, ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit-logs-${new Date().toISOString().split("T")[0]}.csv"`);
      res.send(csv);
    } catch {
      res.status(500).json({ error: "Failed to export audit logs" });
    }
  });

  // ─── GET /api/v1/health — API health check ─────────────────────
  app.get("/api/v1/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      version: "7.1.0",
      timestamp: new Date().toISOString(),
    });
  });
}
