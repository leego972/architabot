/**
 * Notification Channels Router — Slack, Discord, and Email notification delivery.
 * Users can configure webhook URLs for Slack/Discord or email addresses to receive
 * real-time notifications about credential events, scans, and more.
 */
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { notificationChannels } from "../drizzle/schema";
import { getUserPlan, enforceFeature } from "./subscription-gate";
import { logAudit } from "./audit-log-db";
import { createLogger } from "./_core/logger.js";
const log = createLogger("NotificationChannelsRouter");

// ─── Event Types for Notifications ────────────────────────────────
export const NOTIFICATION_EVENT_TYPES = [
  "credential.created",
  "credential.rotated",
  "credential.expired",
  "credential.breach_detected",
  "scan.completed",
  "scan.leak_found",
  "job.completed",
  "job.failed",
  "health.score_dropped",
  "import.completed",
  "team.member_joined",
] as const;

// ─── Slack Message Formatter ──────────────────────────────────────
function formatSlackMessage(event: string, details: Record<string, unknown>): Record<string, unknown> {
  const eventLabels: Record<string, string> = {
    "credential.created": "🔑 New Credential Created",
    "credential.rotated": "🔄 Credential Rotated",
    "credential.expired": "⚠️ Credential Expired",
    "credential.breach_detected": "🚨 Breach Detected",
    "scan.completed": "✅ Scan Completed",
    "scan.leak_found": "🚨 Leak Found",
    "job.completed": "✅ Job Completed",
    "job.failed": "❌ Job Failed",
    "health.score_dropped": "📉 Health Score Dropped",
    "import.completed": "📥 Import Completed",
    "team.member_joined": "👤 Team Member Joined",
  };

  const title = eventLabels[event] || `📢 ${event}`;
  const fields = Object.entries(details)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ({
      title: k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, " $1"),
      value: String(v),
      short: String(v).length < 30,
    }));

  return {
    text: title,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: title, emoji: true },
      },
      {
        type: "section",
        fields: fields.slice(0, 10).map((f) => ({
          type: "mrkdwn",
          text: `*${f.title}:*\n${f.value}`,
        })),
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Archibald Titan • ${new Date().toISOString()}`,
          },
        ],
      },
    ],
  };
}

// ─── Discord Message Formatter ────────────────────────────────────
function formatDiscordMessage(event: string, details: Record<string, unknown>): Record<string, unknown> {
  const colorMap: Record<string, number> = {
    "credential.created": 0x22c55e, // green
    "credential.rotated": 0x3b82f6, // blue
    "credential.expired": 0xf59e0b, // amber
    "credential.breach_detected": 0xef4444, // red
    "scan.completed": 0x22c55e,
    "scan.leak_found": 0xef4444,
    "job.completed": 0x22c55e,
    "job.failed": 0xef4444,
    "health.score_dropped": 0xf59e0b,
    "import.completed": 0x3b82f6,
    "team.member_joined": 0x8b5cf6, // purple
  };

  const fields = Object.entries(details)
    .filter(([, v]) => v !== undefined && v !== null)
    .slice(0, 10)
    .map(([k, v]) => ({
      name: k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, " $1"),
      value: String(v),
      inline: String(v).length < 30,
    }));

  return {
    embeds: [
      {
        title: `📢 ${event}`,
        color: colorMap[event] || 0x6366f1,
        fields,
        footer: { text: "Archibald Titan" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ─── Send Notification ────────────────────────────────────────────
async function sendNotification(
  channel: { type: string; webhookUrl: string | null; emailAddress: string | null; id: number },
  event: string,
  details: Record<string, unknown>
): Promise<boolean> {
  try {
    if (channel.type === "slack" && channel.webhookUrl) {
      const payload = formatSlackMessage(event, details);
      const res = await fetch(channel.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok;
    }

    if (channel.type === "discord" && channel.webhookUrl) {
      const payload = formatDiscordMessage(event, details);
      const res = await fetch(channel.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok || res.status === 204;
    }

    if (channel.type === "email" && channel.emailAddress) {
      // Email notifications would use the existing email service
      // For now, log the notification
      log.info(`[Notification] Email to ${channel.emailAddress}: ${event}`, { detail: details });
      return true;
    }

    return false;
  } catch (err) {
    log.error(`[Notification] Failed to send to channel ${channel.id}:`, { error: String(err) });
    return false;
  }
}

// ─── Dispatch Notification to All Matching Channels ───────────────
export async function dispatchNotification(
  userId: number,
  event: string,
  details: Record<string, unknown>
): Promise<{ sent: number; failed: number }> {
  const db = await getDb();
  if (!db) return { sent: 0, failed: 0 };

  const channels = await db
    .select()
    .from(notificationChannels)
    .where(
      and(
        eq(notificationChannels.userId, userId),
        eq(notificationChannels.active, true)
      )
    );

  let sent = 0;
  let failed = 0;

  for (const channel of channels) {
    const events = channel.events as string[];
    if (!events.includes(event) && !events.includes("*")) continue;

    const success = await sendNotification(channel, event, details);
    if (success) {
      sent++;
      await db
        .update(notificationChannels)
        .set({ lastNotifiedAt: new Date(), failCount: 0 })
        .where(eq(notificationChannels.id, channel.id));
    } else {
      failed++;
      await db
        .update(notificationChannels)
        .set({ failCount: channel.failCount + 1 })
        .where(eq(notificationChannels.id, channel.id));
      // Auto-disable after 5 consecutive failures
      if (channel.failCount + 1 >= 5) {
        await db
          .update(notificationChannels)
          .set({ active: false })
          .where(eq(notificationChannels.id, channel.id));
      }
    }
  }

  return { sent, failed };
}

// ═══════════════════════════════════════════════════════════════════
// tRPC Router
// ═══════════════════════════════════════════════════════════════════
export const notificationChannelsRouter = router({
  /** List all notification channels for the current user */
  list: protectedProcedure.query(async ({ ctx }) => {
    const plan = await getUserPlan(ctx.user.id);
    enforceFeature(plan.planId, "webhooks", "Notification Channels");

    const db = await getDb();
    if (!db) return [];

    const channels = await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.userId, ctx.user.id))
      .orderBy(desc(notificationChannels.createdAt));

    return channels.map((c) => ({
      ...c,
      webhookUrl: c.webhookUrl ? maskUrl(c.webhookUrl) : null,
    }));
  }),

  /** Get available event types */
  eventTypes: protectedProcedure.query(() => {
    return NOTIFICATION_EVENT_TYPES.map((e) => ({
      value: e,
      label: e
        .split(".")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" → "),
      category: e.split(".")[0],
    }));
  }),

  /** Create a new notification channel */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        type: z.enum(["slack", "discord", "email"]),
        webhookUrl: z.string().url().optional(),
        emailAddress: z.string().email().optional(),
        events: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await getUserPlan(ctx.user.id);
      enforceFeature(plan.planId, "webhooks", "Notification Channels");

      // Validate: Slack/Discord need webhookUrl, email needs emailAddress
      if ((input.type === "slack" || input.type === "discord") && !input.webhookUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${input.type === "slack" ? "Slack" : "Discord"} channels require a webhook URL`,
        });
      }
      if (input.type === "email" && !input.emailAddress) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email channels require an email address",
        });
      }

      // Validate webhook URL format
      if (input.type === "slack" && input.webhookUrl) {
        if (!input.webhookUrl.startsWith("https://hooks.slack.com/")) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Slack webhook URL must start with https://hooks.slack.com/",
          });
        }
      }
      if (input.type === "discord" && input.webhookUrl) {
        if (!input.webhookUrl.startsWith("https://discord.com/api/webhooks/") &&
            !input.webhookUrl.startsWith("https://discordapp.com/api/webhooks/")) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Discord webhook URL must start with https://discord.com/api/webhooks/",
          });
        }
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      // Limit to 10 channels per user
      const existing = await db
        .select()
        .from(notificationChannels)
        .where(eq(notificationChannels.userId, ctx.user.id));
      if (existing.length >= 10) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Maximum 10 notification channels allowed",
        });
      }

      const [result] = await db.insert(notificationChannels).values({
        userId: ctx.user.id,
        name: input.name,
        type: input.type,
        webhookUrl: input.webhookUrl || null,
        emailAddress: input.emailAddress || null,
        events: input.events,
        active: true,
        failCount: 0,
      });

      await logAudit({
        userId: ctx.user.id,
        action: "notification_channel.created",
        details: { channelId: result.insertId, type: input.type, name: input.name },
      });

      return { id: result.insertId };
    }),

  /** Update a notification channel */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        events: z.array(z.string()).min(1).optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [channel] = await db
        .select()
        .from(notificationChannels)
        .where(
          and(
            eq(notificationChannels.id, input.id),
            eq(notificationChannels.userId, ctx.user.id)
          )
        );

      if (!channel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
      }

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.events !== undefined) updates.events = input.events;
      if (input.active !== undefined) {
        updates.active = input.active;
        if (input.active) updates.failCount = 0;
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(notificationChannels)
          .set(updates)
          .where(eq(notificationChannels.id, input.id));
      }

      await logAudit({
        userId: ctx.user.id,
        action: "notification_channel.updated",
        details: { channelId: input.id, updates },
      });

      return { success: true };
    }),

  /** Delete a notification channel */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [channel] = await db
        .select()
        .from(notificationChannels)
        .where(
          and(
            eq(notificationChannels.id, input.id),
            eq(notificationChannels.userId, ctx.user.id)
          )
        );

      if (!channel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
      }

      await db
        .delete(notificationChannels)
        .where(eq(notificationChannels.id, input.id));

      await logAudit({
        userId: ctx.user.id,
        action: "notification_channel.deleted",
        details: { channelId: input.id, type: channel.type, name: channel.name },
      });

      return { success: true };
    }),

  /** Test a notification channel by sending a test message */
  test: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [channel] = await db
        .select()
        .from(notificationChannels)
        .where(
          and(
            eq(notificationChannels.id, input.id),
            eq(notificationChannels.userId, ctx.user.id)
          )
        );

      if (!channel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
      }

      const success = await sendNotification(
        channel,
        "test.notification",
        {
          message: "This is a test notification from Archibald Titan",
          timestamp: new Date().toISOString(),
          user: ctx.user.name || "Unknown",
        }
      );

      if (!success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send test notification. Please check your webhook URL.",
        });
      }

      return { success: true };
    }),
});

// ─── Helpers ──────────────────────────────────────────────────────
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    if (path.length > 20) {
      return `${u.origin}${path.slice(0, 15)}...${path.slice(-5)}`;
    }
    return url;
  } catch {
    return url.slice(0, 20) + "...";
  }
}
