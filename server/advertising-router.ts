/**
 * Advertising Router — tRPC procedures for the autonomous advertising system
 * 
 * All procedures are admin-only since this controls the advertising budget
 * and autonomous content generation.
 */

import { z } from "zod";
import { router, adminProcedure } from "./_core/trpc";
import {
  runAdvertisingCycle,
  getStrategyOverview,
  getRecentActivity,
  getPerformanceMetrics,
  GROWTH_STRATEGIES,
  startAdvertisingScheduler,
  stopAdvertisingScheduler,
} from "./advertising-orchestrator";
import {
  runTikTokContentPipeline,
  getTikTokContentStats,
  isTikTokContentConfigured,
  queryCreatorInfo,
  getPostStatus,
} from "./tiktok-content-service";
import {
  generateVideo,
  generateShortFormVideo,
  generateMarketingVideo,
  generateSocialClip,
  getVideoGenerationStatus,
  type GenerateVideoOptions,
} from "./_core/videoGeneration";
import { getDb } from "./db";
import {
  marketingContent,
  marketingActivityLog,
  marketingCampaigns,
  marketingPerformance,
  blogPosts,
  affiliatePartners,
  affiliateClicks,
} from "../drizzle/schema";
import { eq, desc, and, gte, sql, count } from "drizzle-orm";

export const advertisingRouter = router({
  /**
   * Get the full advertising strategy overview
   */
  getStrategy: adminProcedure.query(async () => {
    return getStrategyOverview();
  }),

  /**
   * Get performance metrics for the advertising system
   */
  getPerformance: adminProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }).optional())
    .query(async ({ input }) => {
      const days = input?.days ?? 30;
      return getPerformanceMetrics(days);
    }),

  /**
   * Get recent advertising activity log
   */
  getActivity: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(async ({ input }) => {
      const limit = input?.limit ?? 50;
      return getRecentActivity(limit);
    }),

  /**
   * Manually trigger an advertising cycle (for testing or immediate action)
   */
  runCycle: adminProcedure.mutation(async () => {
    const result = await runAdvertisingCycle();
    return result;
  }),

  /**
   * Get all growth strategies with their details
   */
  getStrategies: adminProcedure.query(async () => {
    return GROWTH_STRATEGIES;
  }),

  /**
   * Get content queue — all generated content awaiting review/publishing
   */
  getContentQueue: adminProcedure
    .input(
      z.object({
        status: z.enum(["draft", "approved", "published", "rejected"]).optional(),
        platform: z.string().optional(),
        limit: z.number().min(1).max(100).default(25),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [];
      if (input?.status) conditions.push(eq(marketingContent.status, input.status as any));
      if (input?.platform) conditions.push(eq(marketingContent.channel, input.platform as any));

      const content = await (db as any).query.marketingContent.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: [desc(marketingContent.createdAt)],
        limit: input?.limit ?? 25,
      });

      return content;
    }),

  /**
   * Approve or reject content from the queue
   */
  updateContentStatus: adminProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["approved", "published", "failed", "draft"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(marketingContent)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(marketingContent.id, input.id));

      return { success: true };
    }),

  /**
   * Get a summary dashboard with key metrics
   */
  getDashboard: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return {
        strategy: getStrategyOverview(),
        performance: null,
        recentActivity: [],
        contentQueue: { draft: 0, approved: 0, published: 0, rejected: 0 },
      };
    }

    const [performance, recentActivity] = await Promise.all([
      getPerformanceMetrics(30),
      getRecentActivity(10),
    ]);

    // Content queue counts
    const contentCounts = await db
      .select({
        status: marketingContent.status,
        count: count(),
      })
      .from(marketingContent)
      .groupBy(marketingContent.status);

    const contentQueue = {
      draft: 0,
      approved: 0,
      published: 0,
      rejected: 0,
    };
    for (const c of contentCounts) {
      if (c.status in contentQueue) {
        (contentQueue as any)[c.status] = Number(c.count);
      }
    }

    return {
      strategy: getStrategyOverview(),
      performance,
      recentActivity,
      contentQueue,
    };
  }),

  /**
   * Get TikTok content posting stats and status
   */
  getTikTokStats: adminProcedure.query(async () => {
    const stats = await getTikTokContentStats();
    const creatorInfo = await queryCreatorInfo();
    return {
      ...stats,
      creatorInfo,
    };
  }),

  /**
   * Manually trigger TikTok content generation and posting
   */
  triggerTikTokPost: adminProcedure.mutation(async () => {
    const result = await runTikTokContentPipeline();
    return result;
  }),

  /**
   * Check the status of a TikTok post by publish_id
   */
  checkTikTokPostStatus: adminProcedure
    .input(z.object({ publishId: z.string() }))
    .query(async ({ input }) => {
      const status = await getPostStatus(input.publishId);
      return status;
    }),

  /**
   * Get budget breakdown and utilization
   */
  /**
   * Get video generation status and availability
   */
  getVideoStatus: adminProcedure.query(async () => {
    return getVideoGenerationStatus();
  }),

  /**
   * Generate a video from a text prompt
   */
  generateVideo: adminProcedure
    .input(
      z.object({
        prompt: z.string().min(5).max(1000),
        duration: z.number().min(1).max(8).default(4),
        aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
        model: z.enum(["seedance", "grok-video"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await generateVideo({
        prompt: input.prompt,
        duration: input.duration,
        aspectRatio: input.aspectRatio,
        model: input.model,
      });
      return result;
    }),

  /**
   * Generate a short-form vertical video (TikTok/YouTube Shorts)
   */
  generateShortVideo: adminProcedure
    .input(
      z.object({
        hook: z.string().min(3).max(200),
        scriptSummary: z.string().min(3).max(500),
      })
    )
    .mutation(async ({ input }) => {
      const result = await generateShortFormVideo(input.hook, input.scriptSummary);
      return result;
    }),

  /**
   * Generate a marketing/ad video
   */
  generateAdVideo: adminProcedure
    .input(
      z.object({
        topic: z.string().min(3).max(300),
        cta: z.string().min(3).max(200),
      })
    )
    .mutation(async ({ input }) => {
      const result = await generateMarketingVideo(input.topic, input.cta);
      return result;
    }),

  /**
   * Generate a social media clip for a specific platform
   */
  generateSocialClip: adminProcedure
    .input(
      z.object({
        feature: z.string().min(3).max(300),
        platform: z.enum(["tiktok", "youtube", "linkedin", "twitter", "instagram"]),
      })
    )
    .mutation(async ({ input }) => {
      const result = await generateSocialClip(input.feature, input.platform);
      return result;
    }),

  getBudgetBreakdown: adminProcedure.query(async () => {
    const overview = getStrategyOverview();
    const performance = await getPerformanceMetrics(30);

    return {
      monthlyBudget: overview.monthlyBudget,
      currency: overview.currency,
      allocation: overview.budgetAllocation,
      utilization: performance?.budgetUtilization || null,
      freeChannels: overview.freeChannelCount,
      paidChannels: overview.paidChannelCount,
      costBreakdown: GROWTH_STRATEGIES.map((s) => ({
        channel: s.channel,
        costPerMonth: s.costPerMonth,
        frequency: s.frequency,
        impact: s.expectedImpact,
        automatable: s.automatable,
      })),
    };
  }),
});
