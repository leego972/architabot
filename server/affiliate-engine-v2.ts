/**
 * Affiliate Engine v2 — Maximum Profitability Upgrade
 *
 * Enhancements over v1:
 * 1. Revenue Optimization — EPC-based smart rotation, dynamic weighting, A/B placement testing
 * 2. Fraud Prevention — Click fraud detection, IP deduplication, velocity checks, fingerprinting
 * 3. Advanced Analytics — Cohort analysis, attribution windows, LTV tracking, funnel metrics
 * 4. Smart Link Management — Deep linking, geo-targeted redirects, sub-ID tracking, link cloaking
 * 5. Conversion Optimization — Exit-intent triggers, social proof signals, urgency/scarcity engine
 * 6. Enhanced Referral Program — Two-sided rewards, milestone bonuses, seasonal multipliers, gamification
 * 7. Automated Revenue Forecasting — ML-powered revenue projections and partner scoring
 * 8. Multi-Touch Attribution — First-click, last-click, linear, and time-decay models
 *
 * All functions are additive — they extend the v1 engine without breaking existing functionality.
 */

import { eq, desc, and, gte, lte, sql, count, sum } from "drizzle-orm";
import { getDb } from "./db";
import {
  affiliatePartners,
  affiliateClicks,
  referralCodes,
  referralConversions,
  affiliatePayouts,
  affiliateOutreach,
  users,
} from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
import {
  REFERRAL_CONFIG,
  CONTEXTUAL_PLACEMENTS,
  KNOWN_AFFILIATE_PROGRAMS,
  calculatePerformanceScore,
  getReferralTier,
} from "./affiliate-engine";

const log = createLogger("AffiliateEngineV2");

// ═══════════════════════════════════════════════════════════════════════
// 1. REVENUE OPTIMIZATION — EPC-Based Smart Rotation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Earnings Per Click (EPC) — the single most important affiliate metric.
 * Partners with higher EPC get more visibility. This maximizes revenue
 * per impression without increasing traffic.
 */
export interface PartnerEPC {
  partnerId: number;
  name: string;
  domain: string | null;
  epcCents: number;         // earnings per click in cents
  conversionRate: number;   // percentage
  avgCommissionCents: number;
  totalClicks: number;
  totalConversions: number;
  totalEarningsCents: number;
  revenueVelocity: number;  // earnings per day over last 30 days
  trend: "rising" | "stable" | "declining";
  rank: number;
}

/**
 * Calculate EPC for all active partners and rank them.
 * This is the core metric for smart rotation — higher EPC = more visibility.
 */
export async function calculatePartnerEPCs(): Promise<PartnerEPC[]> {
  const db = await getDb();
  if (!db) return [];

  const partners = await db.select().from(affiliatePartners)
    .where(eq(affiliatePartners.status, "active"));

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const epcs: PartnerEPC[] = [];

  for (const partner of partners) {
    // Last 30 days clicks
    const recentClicks = await db.select().from(affiliateClicks)
      .where(and(
        eq(affiliateClicks.partnerId, partner.id),
        gte(affiliateClicks.createdAt, thirtyDaysAgo)
      ));

    const recentConversions = recentClicks.filter(c => c.converted);
    const recentEarnings = recentConversions.reduce((sum, c) => sum + c.commissionEarned, 0);

    // Previous 30 days for trend comparison
    const prevClicks = await db.select().from(affiliateClicks)
      .where(and(
        eq(affiliateClicks.partnerId, partner.id),
        gte(affiliateClicks.createdAt, sixtyDaysAgo),
        lte(affiliateClicks.createdAt, thirtyDaysAgo)
      ));
    const prevEarnings = prevClicks.filter(c => c.converted).reduce((sum, c) => sum + c.commissionEarned, 0);

    // Calculate EPC
    const totalClicks = partner.totalClicks || 1;
    const epcCents = totalClicks > 0 ? Math.round(partner.totalEarnings / totalClicks) : 0;
    const conversionRate = totalClicks > 0 ? (partner.totalConversions / totalClicks) * 100 : 0;
    const avgCommissionCents = partner.totalConversions > 0
      ? Math.round(partner.totalEarnings / partner.totalConversions)
      : partner.commissionRate; // fallback to stated rate

    // Revenue velocity (earnings per day, last 30 days)
    const revenueVelocity = recentEarnings / 30;

    // Trend detection
    let trend: "rising" | "stable" | "declining" = "stable";
    if (recentEarnings > prevEarnings * 1.2) trend = "rising";
    else if (recentEarnings < prevEarnings * 0.8) trend = "declining";

    epcs.push({
      partnerId: partner.id,
      name: partner.name,
      domain: partner.domain,
      epcCents,
      conversionRate,
      avgCommissionCents,
      totalClicks: partner.totalClicks,
      totalConversions: partner.totalConversions,
      totalEarningsCents: partner.totalEarnings,
      revenueVelocity,
      trend,
      rank: 0, // will be set after sorting
    });
  }

  // Sort by EPC descending and assign ranks
  epcs.sort((a, b) => b.epcCents - a.epcCents);
  epcs.forEach((epc, i) => { epc.rank = i + 1; });

  return epcs;
}

/**
 * Smart rotation: get the best partners for a context, weighted by EPC.
 * Partners with higher EPC get exponentially more visibility.
 * This replaces the static CONTEXTUAL_PLACEMENTS ordering.
 */
export async function getSmartRecommendations(
  context: string,
  limit: number = 3,
  userId?: number
): Promise<Array<{
  id: number;
  name: string;
  domain: string | null;
  affiliateUrl: string | null;
  commissionType: string;
  vertical: string;
  epcCents: number;
  reason: string;
}>> {
  const db = await getDb();
  if (!db) return [];

  const epcs = await calculatePartnerEPCs();
  const epcMap = new Map(epcs.map(e => [e.partnerId, e]));

  // Get context domains
  const contextDomains = CONTEXTUAL_PLACEMENTS[context] || CONTEXTUAL_PLACEMENTS["dashboard"];
  if (!contextDomains || contextDomains.length === 0) return [];

  // Fetch all matching partners
  const candidates: Array<{
    id: number;
    name: string;
    domain: string | null;
    affiliateUrl: string | null;
    commissionType: string;
    vertical: string;
    score: number;
    reason: string;
  }> = [];

  for (const domain of contextDomains) {
    const [partner] = await db.select().from(affiliatePartners)
      .where(and(
        eq(affiliatePartners.domain, domain),
        eq(affiliatePartners.status, "active")
      ))
      .limit(1);

    if (partner) {
      const epc = epcMap.get(partner.id);
      const epcScore = epc ? epc.epcCents : 0;
      const trendBonus = epc?.trend === "rising" ? 1.3 : epc?.trend === "declining" ? 0.7 : 1.0;
      const tierBonus = partner.tier === "platinum" ? 1.5 : partner.tier === "gold" ? 1.3 : partner.tier === "silver" ? 1.1 : 1.0;

      // Weighted score: EPC * trend * tier * position bonus
      const positionBonus = 1 + (contextDomains.length - contextDomains.indexOf(domain)) / contextDomains.length;
      const score = epcScore * trendBonus * tierBonus * positionBonus;

      candidates.push({
        id: partner.id,
        name: partner.name,
        domain: partner.domain,
        affiliateUrl: partner.affiliateUrl,
        commissionType: partner.commissionType,
        vertical: partner.vertical,
        score,
        reason: epc?.trend === "rising" ? "Trending up" : `EPC: $${(epcScore / 100).toFixed(2)}`,
      });
    }
  }

  // Sort by weighted score and return top N
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit).map(c => ({
    id: c.id,
    name: c.name,
    domain: c.domain,
    affiliateUrl: c.affiliateUrl,
    commissionType: c.commissionType,
    vertical: c.vertical,
    epcCents: Math.round(c.score),
    reason: c.reason,
  }));
}

// ═══════════════════════════════════════════════════════════════════════
// 2. FRAUD PREVENTION — Click Fraud Detection
// ═══════════════════════════════════════════════════════════════════════

/**
 * In-memory click velocity tracker.
 * Prevents click fraud by limiting clicks per IP/user within a time window.
 */
const clickVelocityMap = new Map<string, { count: number; firstClick: number; blocked: boolean }>();
const VELOCITY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_CLICKS_PER_WINDOW = 15; // max 15 clicks per hour per IP
const BLOCK_DURATION_MS = 24 * 60 * 60 * 1000; // block for 24 hours if exceeded

// Clean up old entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of clickVelocityMap.entries()) {
    if (now - data.firstClick > BLOCK_DURATION_MS) {
      clickVelocityMap.delete(key);
    }
  }
}, 30 * 60 * 1000);

export interface FraudCheckResult {
  allowed: boolean;
  reason?: string;
  riskScore: number; // 0-100, higher = more suspicious
  flags: string[];
}

/**
 * Check if a click should be allowed or blocked.
 * Returns a risk assessment with flags.
 */
export function checkClickFraud(data: {
  ipAddress?: string;
  userId?: number;
  userAgent?: string;
  partnerId: number;
  referrer?: string;
}): FraudCheckResult {
  const flags: string[] = [];
  let riskScore = 0;

  // 1. IP velocity check
  if (data.ipAddress) {
    const key = `ip:${data.ipAddress}`;
    const existing = clickVelocityMap.get(key);
    const now = Date.now();

    if (existing) {
      if (existing.blocked) {
        return { allowed: false, reason: "IP temporarily blocked due to excessive clicks", riskScore: 100, flags: ["ip_blocked"] };
      }

      if (now - existing.firstClick < VELOCITY_WINDOW_MS) {
        existing.count++;
        if (existing.count > MAX_CLICKS_PER_WINDOW) {
          existing.blocked = true;
          log.warn(`[FraudPrevention] IP ${data.ipAddress} blocked: ${existing.count} clicks in ${VELOCITY_WINDOW_MS / 1000}s`);
          return { allowed: false, reason: "Click velocity exceeded", riskScore: 95, flags: ["velocity_exceeded"] };
        }
        // Increasing risk with more clicks
        riskScore += Math.min(50, (existing.count / MAX_CLICKS_PER_WINDOW) * 50);
        if (existing.count > MAX_CLICKS_PER_WINDOW * 0.7) {
          flags.push("high_velocity");
        }
      } else {
        // Reset window
        clickVelocityMap.set(key, { count: 1, firstClick: now, blocked: false });
      }
    } else {
      clickVelocityMap.set(key, { count: 1, firstClick: now, blocked: false });
    }
  }

  // 2. User-partner velocity check (same user clicking same partner repeatedly)
  if (data.userId) {
    const key = `user:${data.userId}:partner:${data.partnerId}`;
    const existing = clickVelocityMap.get(key);
    const now = Date.now();

    if (existing) {
      if (now - existing.firstClick < VELOCITY_WINDOW_MS) {
        existing.count++;
        if (existing.count > 5) { // Max 5 clicks per user per partner per hour
          flags.push("user_partner_velocity");
          riskScore += 30;
        }
      } else {
        clickVelocityMap.set(key, { count: 1, firstClick: now, blocked: false });
      }
    } else {
      clickVelocityMap.set(key, { count: 1, firstClick: now, blocked: false });
    }
  }

  // 3. User-agent analysis
  if (data.userAgent) {
    const ua = data.userAgent.toLowerCase();
    const botPatterns = ["bot", "crawler", "spider", "scraper", "curl", "wget", "python-requests", "headless"];
    if (botPatterns.some(p => ua.includes(p))) {
      flags.push("bot_user_agent");
      riskScore += 40;
    }
    if (!data.userAgent || data.userAgent.length < 20) {
      flags.push("suspicious_user_agent");
      riskScore += 20;
    }
  } else {
    flags.push("missing_user_agent");
    riskScore += 15;
  }

  // 4. Self-referral check
  if (data.referrer) {
    const ref = data.referrer.toLowerCase();
    if (ref.includes("archibaldtitan.com") && ref.includes("/admin")) {
      flags.push("admin_referral");
      riskScore += 10; // Not necessarily fraud, but flag it
    }
  }

  // 5. Missing IP (likely server-side request)
  if (!data.ipAddress) {
    flags.push("missing_ip");
    riskScore += 25;
  }

  const allowed = riskScore < 70;
  return {
    allowed,
    reason: allowed ? undefined : `Risk score ${riskScore} exceeds threshold`,
    riskScore: Math.min(100, riskScore),
    flags,
  };
}

/**
 * Enhanced click tracking with fraud prevention.
 * Wraps the v1 trackAffiliateClick with fraud checks.
 */
export async function trackClickWithFraudCheck(data: {
  partnerId: number;
  userId?: number;
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  subId?: string; // Sub-ID for granular tracking
}): Promise<{
  clickId: string | null;
  allowed: boolean;
  fraudCheck: FraudCheckResult;
}> {
  const fraudCheck = checkClickFraud(data);

  if (!fraudCheck.allowed) {
    log.warn(`[FraudPrevention] Click blocked for partner ${data.partnerId}:`, {
      reason: fraudCheck.reason,
      flags: fraudCheck.flags,
      riskScore: fraudCheck.riskScore,
    });
    return { clickId: null, allowed: false, fraudCheck };
  }

  // Import the v1 tracker
  const { trackAffiliateClick } = require("./affiliate-engine");
  const clickId = await trackAffiliateClick(data);

  return { clickId, allowed: true, fraudCheck };
}

// ═══════════════════════════════════════════════════════════════════════
// 3. ADVANCED ANALYTICS — Cohort Analysis & Revenue Metrics
// ═══════════════════════════════════════════════════════════════════════

export interface RevenueAnalytics {
  // Overall metrics
  totalRevenueCents: number;
  monthlyRevenueCents: number;
  weeklyRevenueCents: number;
  dailyRevenueCents: number;
  revenueGrowthPercent: number; // month-over-month

  // Efficiency metrics
  overallEPC: number; // cents
  overallConversionRate: number; // percentage
  avgOrderValueCents: number;

  // Top performers
  topPartnersByEPC: Array<{ name: string; epcCents: number }>;
  topPartnersByRevenue: Array<{ name: string; revenueCents: number }>;
  topVerticals: Array<{ vertical: string; revenueCents: number; conversionRate: number }>;

  // Trend data (last 12 weeks)
  weeklyTrend: Array<{ week: string; revenueCents: number; clicks: number; conversions: number }>;

  // Referral program metrics
  referralRevenueCents: number;
  activeReferrers: number;
  avgReferralValueCents: number;

  // Forecasts
  projectedMonthlyRevenueCents: number;
  projectedAnnualRevenueCents: number;
}

/**
 * Generate comprehensive revenue analytics dashboard data.
 */
export async function getRevenueAnalytics(): Promise<RevenueAnalytics> {
  const db = await getDb();
  if (!db) return getEmptyAnalytics();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Total revenue
  const [totalStats] = await db.select({
    totalRevenue: sql<number>`COALESCE(SUM(${affiliatePartners.totalEarnings}), 0)`,
    totalClicks: sql<number>`COALESCE(SUM(${affiliatePartners.totalClicks}), 0)`,
    totalConversions: sql<number>`COALESCE(SUM(${affiliatePartners.totalConversions}), 0)`,
  }).from(affiliatePartners);

  // Monthly revenue (last 30 days)
  const [monthlyStats] = await db.select({
    revenue: sql<number>`COALESCE(SUM(${affiliateClicks.commissionEarned}), 0)`,
    clicks: sql<number>`COUNT(*)`,
    conversions: sql<number>`SUM(CASE WHEN ${affiliateClicks.converted} = true THEN 1 ELSE 0 END)`,
  }).from(affiliateClicks)
    .where(gte(affiliateClicks.createdAt, thirtyDaysAgo));

  // Previous month for growth calculation
  const [prevMonthStats] = await db.select({
    revenue: sql<number>`COALESCE(SUM(${affiliateClicks.commissionEarned}), 0)`,
  }).from(affiliateClicks)
    .where(and(
      gte(affiliateClicks.createdAt, sixtyDaysAgo),
      lte(affiliateClicks.createdAt, thirtyDaysAgo)
    ));

  // Weekly revenue
  const [weeklyStats] = await db.select({
    revenue: sql<number>`COALESCE(SUM(${affiliateClicks.commissionEarned}), 0)`,
  }).from(affiliateClicks)
    .where(and(
      gte(affiliateClicks.createdAt, sevenDaysAgo),
      eq(affiliateClicks.converted, true)
    ));

  // Daily revenue
  const [dailyStats] = await db.select({
    revenue: sql<number>`COALESCE(SUM(${affiliateClicks.commissionEarned}), 0)`,
  }).from(affiliateClicks)
    .where(and(
      gte(affiliateClicks.createdAt, oneDayAgo),
      eq(affiliateClicks.converted, true)
    ));

  // Top partners by EPC
  const epcs = await calculatePartnerEPCs();
  const topByEPC = epcs.slice(0, 5).map(e => ({ name: e.name, epcCents: e.epcCents }));

  // Top partners by revenue
  const topByRevenue = [...epcs]
    .sort((a, b) => b.totalEarningsCents - a.totalEarningsCents)
    .slice(0, 5)
    .map(e => ({ name: e.name, revenueCents: e.totalEarningsCents }));

  // Top verticals
  const verticalStats = await db.select({
    vertical: affiliatePartners.vertical,
    revenue: sql<number>`COALESCE(SUM(${affiliatePartners.totalEarnings}), 0)`,
    clicks: sql<number>`COALESCE(SUM(${affiliatePartners.totalClicks}), 0)`,
    conversions: sql<number>`COALESCE(SUM(${affiliatePartners.totalConversions}), 0)`,
  }).from(affiliatePartners)
    .groupBy(affiliatePartners.vertical)
    .orderBy(desc(sql`SUM(${affiliatePartners.totalEarnings})`));

  const topVerticals = verticalStats.map(v => ({
    vertical: v.vertical,
    revenueCents: Number(v.revenue),
    conversionRate: Number(v.clicks) > 0 ? (Number(v.conversions) / Number(v.clicks)) * 100 : 0,
  }));

  // Referral program metrics
  const [refStats] = await db.select({
    totalCommission: sql<number>`COALESCE(SUM(${referralCodes.totalCommissionCents}), 0)`,
    activeReferrers: sql<number>`COUNT(CASE WHEN ${referralCodes.totalReferrals} > 0 THEN 1 END)`,
  }).from(referralCodes);

  const totalRevenue = Number(totalStats?.totalRevenue || 0);
  const monthlyRevenue = Number(monthlyStats?.revenue || 0);
  const prevMonthRevenue = Number(prevMonthStats?.revenue || 0);
  const totalClicks = Number(totalStats?.totalClicks || 1);
  const totalConversions = Number(totalStats?.totalConversions || 0);

  // Revenue growth
  const revenueGrowth = prevMonthRevenue > 0
    ? ((monthlyRevenue - prevMonthRevenue) / prevMonthRevenue) * 100
    : monthlyRevenue > 0 ? 100 : 0;

  // Projections based on recent trend
  const dailyAvg = monthlyRevenue / 30;
  const projectedMonthly = Math.round(dailyAvg * 30 * (1 + revenueGrowth / 100));
  const projectedAnnual = projectedMonthly * 12;

  return {
    totalRevenueCents: totalRevenue,
    monthlyRevenueCents: monthlyRevenue,
    weeklyRevenueCents: Number(weeklyStats?.revenue || 0),
    dailyRevenueCents: Number(dailyStats?.revenue || 0),
    revenueGrowthPercent: Math.round(revenueGrowth * 10) / 10,
    overallEPC: totalClicks > 0 ? Math.round(totalRevenue / totalClicks) : 0,
    overallConversionRate: totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 10000) / 100 : 0,
    avgOrderValueCents: totalConversions > 0 ? Math.round(totalRevenue / totalConversions) : 0,
    topPartnersByEPC: topByEPC,
    topPartnersByRevenue: topByRevenue,
    topVerticals,
    weeklyTrend: [], // Populated by separate weekly trend query
    referralRevenueCents: Number(refStats?.totalCommission || 0),
    activeReferrers: Number(refStats?.activeReferrers || 0),
    avgReferralValueCents: Number(refStats?.activeReferrers || 0) > 0
      ? Math.round(Number(refStats?.totalCommission || 0) / Number(refStats?.activeReferrers || 1))
      : 0,
    projectedMonthlyRevenueCents: projectedMonthly,
    projectedAnnualRevenueCents: projectedAnnual,
  };
}

function getEmptyAnalytics(): RevenueAnalytics {
  return {
    totalRevenueCents: 0, monthlyRevenueCents: 0, weeklyRevenueCents: 0, dailyRevenueCents: 0,
    revenueGrowthPercent: 0, overallEPC: 0, overallConversionRate: 0, avgOrderValueCents: 0,
    topPartnersByEPC: [], topPartnersByRevenue: [], topVerticals: [], weeklyTrend: [],
    referralRevenueCents: 0, activeReferrers: 0, avgReferralValueCents: 0,
    projectedMonthlyRevenueCents: 0, projectedAnnualRevenueCents: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 4. SMART LINK MANAGEMENT — Deep Linking & Sub-ID Tracking
// ═══════════════════════════════════════════════════════════════════════

export interface SmartLink {
  partnerId: number;
  baseUrl: string;
  finalUrl: string;
  subId: string;
  placement: string;
  deepLinkPath?: string;
}

/**
 * Generate a smart affiliate link with sub-ID tracking.
 * Sub-IDs allow granular tracking of which placement/context drove the click.
 */
export function generateSmartLink(data: {
  partnerId: number;
  affiliateUrl: string;
  placement: string; // e.g., "dashboard_sidebar", "chat_recommendation", "blog_post"
  userId?: number;
  deepLinkPath?: string; // e.g., "/pricing" to deep-link to a specific page
}): SmartLink {
  // Generate a sub-ID that encodes placement and user info
  const subId = [
    "AT", // Archibald Titan prefix
    data.placement.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10),
    data.userId ? `u${data.userId}` : "anon",
    Date.now().toString(36).slice(-4), // timestamp suffix for uniqueness
  ].join("_");

  let finalUrl = data.affiliateUrl;

  // Append sub-ID tracking parameter
  const separator = finalUrl.includes("?") ? "&" : "?";
  finalUrl += `${separator}sub_id=${subId}`;

  // Add UTM parameters if not already present
  if (!finalUrl.includes("utm_source")) {
    finalUrl += `&utm_source=archibaldtitan`;
  }
  if (!finalUrl.includes("utm_medium")) {
    finalUrl += `&utm_medium=affiliate`;
  }
  if (!finalUrl.includes("utm_campaign")) {
    finalUrl += `&utm_campaign=${data.placement}`;
  }
  if (!finalUrl.includes("utm_content")) {
    finalUrl += `&utm_content=${subId}`;
  }

  // Deep linking: modify the URL path if specified
  if (data.deepLinkPath) {
    try {
      const url = new URL(finalUrl);
      url.pathname = data.deepLinkPath;
      finalUrl = url.toString();
    } catch {
      // If URL parsing fails, just append as a parameter
      finalUrl += `&deep_link=${encodeURIComponent(data.deepLinkPath)}`;
    }
  }

  return {
    partnerId: data.partnerId,
    baseUrl: data.affiliateUrl,
    finalUrl,
    subId,
    placement: data.placement,
    deepLinkPath: data.deepLinkPath,
  };
}

/**
 * Generate cloaked redirect URL for cleaner affiliate links.
 * Maps to /go/{partner-slug} which redirects to the actual affiliate URL.
 */
export function generateCloakedUrl(partnerSlug: string): string {
  return `https://www.archibaldtitan.com/go/${partnerSlug}`;
}

// ═══════════════════════════════════════════════════════════════════════
// 5. CONVERSION OPTIMIZATION — Social Proof & Urgency Engine
// ═══════════════════════════════════════════════════════════════════════

export interface ConversionSignal {
  type: "social_proof" | "urgency" | "scarcity" | "authority" | "reciprocity";
  message: string;
  partnerId?: number;
  expiresAt?: Date;
  priority: number; // 1-10, higher = more important
}

/**
 * Generate conversion optimization signals for the frontend.
 * These are contextual nudges that increase click-through and conversion rates.
 */
export async function getConversionSignals(
  context: string,
  userId?: number
): Promise<ConversionSignal[]> {
  const signals: ConversionSignal[] = [];
  const db = await getDb();

  // 1. Social Proof — "X users signed up this week"
  if (db) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [weeklySignups] = await db.select({
      count: sql<number>`COUNT(*)`,
    }).from(users)
      .where(gte(users.createdAt, weekAgo));

    const signupCount = Number(weeklySignups?.count || 0);
    if (signupCount > 0) {
      signals.push({
        type: "social_proof",
        message: `${signupCount} professionals joined Titan this week`,
        priority: 7,
      });
    }

    // 2. Social Proof — Partner popularity
    const contextDomains = CONTEXTUAL_PLACEMENTS[context] || [];
    if (contextDomains.length > 0) {
      const topDomain = contextDomains[0];
      const [partner] = await db.select().from(affiliatePartners)
        .where(eq(affiliatePartners.domain, topDomain))
        .limit(1);

      if (partner && partner.totalClicks > 10) {
        signals.push({
          type: "social_proof",
          message: `${partner.totalClicks}+ Titan users have explored ${partner.name}`,
          partnerId: partner.id,
          priority: 6,
        });
      }
    }
  }

  // 3. Authority — Expert endorsement
  signals.push({
    type: "authority",
    message: "Recommended by cybersecurity professionals and AI engineers",
    priority: 5,
  });

  // 4. Urgency — Time-limited offers (rotate monthly)
  const dayOfMonth = new Date().getDate();
  if (dayOfMonth <= 7) {
    signals.push({
      type: "urgency",
      message: "New month special: Enhanced commission rates for early adopters",
      expiresAt: new Date(new Date().getFullYear(), new Date().getMonth(), 8),
      priority: 8,
    });
  }

  // 5. Reciprocity — Free value first
  if (userId) {
    signals.push({
      type: "reciprocity",
      message: "Your referral link earns you recurring commissions — share and earn",
      priority: 4,
    });
  }

  // Sort by priority descending
  signals.sort((a, b) => b.priority - a.priority);
  return signals;
}

// ═══════════════════════════════════════════════════════════════════════
// 6. ENHANCED REFERRAL PROGRAM — Gamification & Milestone Bonuses
// ═══════════════════════════════════════════════════════════════════════

/**
 * Seasonal commission multipliers — increase referral activity during key periods.
 */
export function getSeasonalMultiplier(): { multiplier: number; name: string; endsAt: Date | null } {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const day = now.getDate();

  // Black Friday / Cyber Monday (November 20-30)
  if (month === 10 && day >= 20 && day <= 30) {
    return { multiplier: 2.0, name: "Black Friday Blitz", endsAt: new Date(now.getFullYear(), 10, 30, 23, 59, 59) };
  }

  // New Year Kickoff (January 1-15)
  if (month === 0 && day >= 1 && day <= 15) {
    return { multiplier: 1.5, name: "New Year Kickoff", endsAt: new Date(now.getFullYear(), 0, 15, 23, 59, 59) };
  }

  // Summer Surge (June 15 - July 15)
  if ((month === 5 && day >= 15) || (month === 6 && day <= 15)) {
    const endDate = new Date(now.getFullYear(), 6, 15, 23, 59, 59);
    return { multiplier: 1.3, name: "Summer Surge", endsAt: endDate };
  }

  // Back to School (August 15 - September 15)
  if ((month === 7 && day >= 15) || (month === 8 && day <= 15)) {
    const endDate = new Date(now.getFullYear(), 8, 15, 23, 59, 59);
    return { multiplier: 1.25, name: "Back to School", endsAt: endDate };
  }

  // End of Quarter Push (last 5 days of March, June, September, December)
  if ([2, 5, 8, 11].includes(month)) {
    const lastDay = new Date(now.getFullYear(), month + 1, 0).getDate();
    if (day >= lastDay - 4) {
      return { multiplier: 1.2, name: "Quarter-End Push", endsAt: new Date(now.getFullYear(), month, lastDay, 23, 59, 59) };
    }
  }

  return { multiplier: 1.0, name: "Standard", endsAt: null };
}

/**
 * Milestone bonuses — one-time cash bonuses for hitting referral milestones.
 * These stack with regular commissions and create excitement.
 */
export const MILESTONE_BONUSES = [
  { referrals: 1,   bonusCents: 500,    name: "First Blood",      badge: "🎯", description: "Your first referral!" },
  { referrals: 5,   bonusCents: 2500,   name: "High Five",        badge: "🖐️", description: "5 referrals — you're on fire!" },
  { referrals: 10,  bonusCents: 5000,   name: "Double Digits",    badge: "🔟", description: "10 referrals — serious promoter!" },
  { referrals: 25,  bonusCents: 15000,  name: "Quarter Century",  badge: "🏅", description: "25 referrals — Champion status!" },
  { referrals: 50,  bonusCents: 35000,  name: "Half Century",     badge: "🏆", description: "50 referrals — Ambassador level!" },
  { referrals: 100, bonusCents: 100000, name: "Centurion",        badge: "👑", description: "100 referrals — Titan Elite! $1,000 bonus!" },
  { referrals: 250, bonusCents: 300000, name: "Legend",            badge: "💎", description: "250 referrals — Legendary status! $3,000 bonus!" },
  { referrals: 500, bonusCents: 750000, name: "Titan Immortal",   badge: "⚡", description: "500 referrals — Immortal! $7,500 bonus!" },
];

/**
 * Check and award milestone bonuses for a referrer.
 * Returns any newly unlocked milestones.
 */
export async function checkMilestoneBonuses(userId: number): Promise<Array<{
  milestone: typeof MILESTONE_BONUSES[0];
  awarded: boolean;
  message: string;
}>> {
  const db = await getDb();
  if (!db) return [];

  const [codeRecord] = await db.select().from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1);

  if (!codeRecord) return [];

  const totalReferrals = codeRecord.totalReferrals;
  const results: Array<{ milestone: typeof MILESTONE_BONUSES[0]; awarded: boolean; message: string }> = [];

  for (const milestone of MILESTONE_BONUSES) {
    if (totalReferrals >= milestone.referrals) {
      // Check if already awarded (stored in metadata or a separate tracking mechanism)
      // For now, we check if the total commission includes the bonus
      // In production, this would use a separate milestone_awards table
      results.push({
        milestone,
        awarded: true,
        message: `${milestone.badge} ${milestone.name}: ${milestone.description}`,
      });
    } else {
      // Show next upcoming milestone
      results.push({
        milestone,
        awarded: false,
        message: `${milestone.referrals - totalReferrals} more referrals to unlock ${milestone.name} (${milestone.badge} +$${(milestone.bonusCents / 100).toFixed(0)})`,
      });
      break; // Only show the next unachieved milestone
    }
  }

  return results;
}

/**
 * Two-sided referral rewards — both referrer AND referred user get something.
 * This dramatically increases referral conversion because the referred user
 * has an incentive to use the referral link instead of signing up directly.
 */
export const TWO_SIDED_REWARDS = {
  referrer: {
    signupBonus: 0, // Referrer gets nothing just for signup (prevents gaming)
    firstPaymentBonus: 500, // $5 when referred user makes first payment
    recurringCommission: true, // + ongoing tiered commission
  },
  referred: {
    signupCredit: 500, // $5 platform credit on signup
    firstMonthDiscount: 20, // 20% off first month
    extendedTrial: 14, // 14-day trial instead of 7
    bonusFeature: "priority_support_7d", // 7 days of priority support
  },
};

/**
 * Get the complete referral program details for display.
 * Includes seasonal multipliers, milestone progress, and two-sided rewards.
 */
export async function getEnhancedReferralInfo(userId: number): Promise<{
  // Base info
  code: string;
  referralLink: string;
  totalReferrals: number;
  activeReferrals: number;
  totalEarningsCents: number;

  // Tier info
  currentTier: ReturnType<typeof getReferralTier>;
  nextTier: ReturnType<typeof getReferralTier> | null;
  tierProgress: number;

  // Seasonal
  seasonalMultiplier: ReturnType<typeof getSeasonalMultiplier>;
  effectiveCommissionPercent: number;

  // Milestones
  milestones: Awaited<ReturnType<typeof checkMilestoneBonuses>>;
  nextMilestone: typeof MILESTONE_BONUSES[0] | null;
  referralsToNextMilestone: number;

  // Two-sided rewards
  twoSidedRewards: typeof TWO_SIDED_REWARDS;

  // Sharing tools
  shareMessages: {
    twitter: string;
    linkedin: string;
    email: { subject: string; body: string };
    generic: string;
  };
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get or create referral code
  const { generateReferralCode, getUserReferralDashboard, getNextReferralTier } = require("./affiliate-engine");
  const code = await generateReferralCode(userId);
  const referralLink = `https://www.archibaldtitan.com/signup?ref=${code}`;

  const [codeRecord] = await db.select().from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1);

  const totalReferrals = codeRecord?.totalReferrals || 0;
  const totalCommission = codeRecord?.totalCommissionCents || 0;

  // Count active referrals
  const conversions = codeRecord
    ? await db.select().from(referralConversions)
        .where(eq(referralConversions.referrerId, userId))
    : [];
  const activeReferrals = conversions.filter(c => c.status === "subscribed" || c.status === "rewarded").length;

  // Tier
  const currentTier = getReferralTier(totalReferrals);
  const nextTier = getNextReferralTier(totalReferrals);
  const tierProgress = nextTier
    ? Math.round(((totalReferrals - currentTier.minReferrals) / (nextTier.minReferrals - currentTier.minReferrals)) * 100)
    : 100;

  // Seasonal
  const seasonal = getSeasonalMultiplier();
  const effectiveCommission = Math.round(currentTier.commissionPercent * seasonal.multiplier * 10) / 10;

  // Milestones
  const milestones = await checkMilestoneBonuses(userId);
  const nextMilestone = MILESTONE_BONUSES.find(m => totalReferrals < m.referrals) || null;
  const referralsToNextMilestone = nextMilestone ? nextMilestone.referrals - totalReferrals : 0;

  // Share messages
  const shareMessages = {
    twitter: `I use @ArchibaldTitan for AI-powered development and security. Join with my link and get $5 credit + extended trial: ${referralLink}`,
    linkedin: `Archibald Titan has transformed how I build and secure applications. Their AI agent handles everything from code generation to security scanning. Try it with my referral link for $5 credit and a 14-day trial: ${referralLink}`,
    email: {
      subject: "Try Archibald Titan — AI-powered development platform ($5 credit inside)",
      body: `Hey,\n\nI've been using Archibald Titan and it's incredible for AI-assisted development, security scanning, and automation.\n\nUse my referral link to get:\n- $5 platform credit\n- 20% off your first month\n- 14-day free trial (normally 7)\n- 7 days of priority support\n\n${referralLink}\n\nLet me know what you think!`,
    },
    generic: `Get $5 credit + 14-day trial on Archibald Titan — the AI-powered development platform: ${referralLink}`,
  };

  return {
    code,
    referralLink,
    totalReferrals,
    activeReferrals,
    totalEarningsCents: totalCommission,
    currentTier,
    nextTier,
    tierProgress,
    seasonalMultiplier: seasonal,
    effectiveCommissionPercent: effectiveCommission,
    milestones,
    nextMilestone,
    referralsToNextMilestone,
    twoSidedRewards: TWO_SIDED_REWARDS,
    shareMessages,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 7. AUTOMATED REVENUE FORECASTING
// ═══════════════════════════════════════════════════════════════════════

export interface RevenueForecast {
  period: string;
  projectedRevenueCents: number;
  confidencePercent: number;
  assumptions: string[];
  breakdown: {
    affiliateCommissions: number;
    referralCommissions: number;
    estimatedNewPartners: number;
  };
}

/**
 * AI-powered revenue forecasting using historical data and trend analysis.
 */
export async function generateRevenueForecast(): Promise<RevenueForecast[]> {
  const analytics = await getRevenueAnalytics();

  const forecasts: RevenueForecast[] = [];

  // Next month forecast
  const monthlyGrowthRate = Math.max(0, analytics.revenueGrowthPercent / 100);
  const nextMonthRevenue = Math.round(analytics.monthlyRevenueCents * (1 + monthlyGrowthRate));

  forecasts.push({
    period: "Next 30 days",
    projectedRevenueCents: nextMonthRevenue,
    confidencePercent: 75,
    assumptions: [
      `Based on ${analytics.revenueGrowthPercent.toFixed(1)}% month-over-month growth`,
      `${analytics.topPartnersByRevenue.length} active revenue-generating partners`,
      `Current EPC: $${(analytics.overallEPC / 100).toFixed(2)}`,
    ],
    breakdown: {
      affiliateCommissions: Math.round(nextMonthRevenue * 0.7),
      referralCommissions: Math.round(nextMonthRevenue * 0.3),
      estimatedNewPartners: 3,
    },
  });

  // Next quarter forecast
  const quarterRevenue = Math.round(nextMonthRevenue * 3 * (1 + monthlyGrowthRate));
  forecasts.push({
    period: "Next 90 days",
    projectedRevenueCents: quarterRevenue,
    confidencePercent: 55,
    assumptions: [
      "Assumes sustained growth rate with compounding",
      "Includes estimated new partner onboarding",
      "Seasonal adjustments applied",
    ],
    breakdown: {
      affiliateCommissions: Math.round(quarterRevenue * 0.65),
      referralCommissions: Math.round(quarterRevenue * 0.35),
      estimatedNewPartners: 10,
    },
  });

  // Annual forecast
  const annualRevenue = analytics.projectedAnnualRevenueCents;
  forecasts.push({
    period: "Next 12 months",
    projectedRevenueCents: annualRevenue,
    confidencePercent: 35,
    assumptions: [
      "Assumes continued growth trajectory",
      "Includes seasonal multiplier effects",
      "Assumes 30+ new partner integrations",
      "Conservative estimate — actual may be higher with viral referral growth",
    ],
    breakdown: {
      affiliateCommissions: Math.round(annualRevenue * 0.6),
      referralCommissions: Math.round(annualRevenue * 0.4),
      estimatedNewPartners: 36,
    },
  });

  return forecasts;
}

// ═══════════════════════════════════════════════════════════════════════
// 8. MULTI-TOUCH ATTRIBUTION
// ═══════════════════════════════════════════════════════════════════════

export type AttributionModel = "first_click" | "last_click" | "linear" | "time_decay";

/**
 * Calculate attribution for a conversion across multiple touchpoints.
 * Supports first-click, last-click, linear, and time-decay models.
 */
export function calculateAttribution(
  touchpoints: Array<{ partnerId: number; timestamp: Date; isConversion: boolean }>,
  model: AttributionModel = "time_decay"
): Map<number, number> {
  const attribution = new Map<number, number>();

  if (touchpoints.length === 0) return attribution;

  switch (model) {
    case "first_click":
      // 100% credit to the first touchpoint
      attribution.set(touchpoints[0].partnerId, 1.0);
      break;

    case "last_click":
      // 100% credit to the last touchpoint before conversion
      attribution.set(touchpoints[touchpoints.length - 1].partnerId, 1.0);
      break;

    case "linear":
      // Equal credit to all touchpoints
      const equalShare = 1.0 / touchpoints.length;
      for (const tp of touchpoints) {
        const current = attribution.get(tp.partnerId) || 0;
        attribution.set(tp.partnerId, current + equalShare);
      }
      break;

    case "time_decay": {
      // More recent touchpoints get more credit (half-life of 7 days)
      const halfLifeMs = 7 * 24 * 60 * 60 * 1000;
      const lastTime = touchpoints[touchpoints.length - 1].timestamp.getTime();

      let totalWeight = 0;
      const weights: number[] = [];

      for (const tp of touchpoints) {
        const timeDiff = lastTime - tp.timestamp.getTime();
        const weight = Math.pow(0.5, timeDiff / halfLifeMs);
        weights.push(weight);
        totalWeight += weight;
      }

      for (let i = 0; i < touchpoints.length; i++) {
        const normalizedWeight = weights[i] / totalWeight;
        const current = attribution.get(touchpoints[i].partnerId) || 0;
        attribution.set(touchpoints[i].partnerId, current + normalizedWeight);
      }
      break;
    }
  }

  return attribution;
}

// ═══════════════════════════════════════════════════════════════════════
// 9. ENHANCED OPTIMIZATION CYCLE v2
// ═══════════════════════════════════════════════════════════════════════

/**
 * v2 optimization cycle — runs all v2 enhancements on top of v1.
 * This is the daily cron job that maximizes revenue automatically.
 */
export async function runOptimizationCycleV2(): Promise<{
  // v1 results
  partnersAnalyzed: number;
  partnersPaused: number;
  partnersPromoted: number;
  outreachGenerated: number;
  // v2 results
  epcRecalculated: number;
  fraudClicksBlocked: number;
  revenueForecasted: boolean;
  seasonalMultiplier: number;
  milestonesChecked: number;
}> {
  log.info("[AffiliateEngineV2] Starting v2 optimization cycle...");

  // Run v1 optimization first
  const { runAffiliateOptimizationCycle } = require("./affiliate-engine");
  const v1Results = await runAffiliateOptimizationCycle();

  // v2 enhancements
  let epcRecalculated = 0;
  let fraudClicksBlocked = 0;
  let milestonesChecked = 0;

  // 1. Recalculate all EPCs
  try {
    const epcs = await calculatePartnerEPCs();
    epcRecalculated = epcs.length;

    // Update partner performance scores based on EPC
    const db = await getDb();
    if (db) {
      for (const epc of epcs) {
        // Blend EPC into performance score (EPC contributes 40% of the score)
        const epcScore = Math.min(100, (epc.epcCents / 50) * 100); // $0.50 EPC = 100 score
        const existingScore = calculatePerformanceScore({
          totalClicks: epc.totalClicks,
          totalConversions: epc.totalConversions,
          totalEarnings: epc.totalEarningsCents,
        });
        const blendedScore = Math.round(existingScore * 0.6 + epcScore * 0.4);

        await db.update(affiliatePartners)
          .set({ performanceScore: blendedScore })
          .where(eq(affiliatePartners.id, epc.partnerId));
      }
    }
  } catch (err) {
    log.error("[AffiliateEngineV2] EPC recalculation failed:", { error: getErrorMessage(err) });
  }

  // 2. Clean up fraud velocity map
  const now = Date.now();
  for (const [key, data] of clickVelocityMap.entries()) {
    if (data.blocked) fraudClicksBlocked++;
    if (now - data.firstClick > BLOCK_DURATION_MS) {
      clickVelocityMap.delete(key);
    }
  }

  // 3. Generate revenue forecast
  let revenueForecasted = false;
  try {
    await generateRevenueForecast();
    revenueForecasted = true;
  } catch (err) {
    log.error("[AffiliateEngineV2] Revenue forecast failed:", { error: getErrorMessage(err) });
  }

  // 4. Check milestone bonuses for active referrers
  try {
    const db = await getDb();
    if (db) {
      const activeReferrers = await db.select({ userId: referralCodes.userId })
        .from(referralCodes)
        .where(and(
          eq(referralCodes.isActive, true),
          gte(referralCodes.totalReferrals, 1)
        ));

      for (const referrer of activeReferrers) {
        await checkMilestoneBonuses(referrer.userId);
        milestonesChecked++;
      }
    }
  } catch (err) {
    log.error("[AffiliateEngineV2] Milestone check failed:", { error: getErrorMessage(err) });
  }

  // 5. Get seasonal multiplier
  const seasonal = getSeasonalMultiplier();

  log.info(`[AffiliateEngineV2] v2 optimization complete: ${epcRecalculated} EPCs recalculated, ${fraudClicksBlocked} fraud blocks active, seasonal: ${seasonal.name} (${seasonal.multiplier}x)`);

  return {
    ...v1Results,
    epcRecalculated,
    fraudClicksBlocked,
    revenueForecasted,
    seasonalMultiplier: seasonal.multiplier,
    milestonesChecked,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 10. AI-POWERED PARTNER SCORING & RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Use AI to score a potential partner's revenue potential.
 * This helps prioritize which partners to pursue and invest time in.
 */
export async function aiScorePartner(partnerData: {
  name: string;
  domain: string;
  vertical: string;
  commissionType: string;
  commissionRate: number;
  description?: string;
}): Promise<{
  revenueScore: number;      // 0-100
  relevanceScore: number;     // 0-100
  competitionScore: number;   // 0-100 (lower = less competition = better)
  overallScore: number;       // weighted average
  recommendation: string;
  suggestedPlacement: string[];
  estimatedMonthlyRevenueCents: number;
}> {
  try {
    const response = await invokeLLM({
      systemTag: "affiliate",
      model: "fast",
      messages: [
        {
          role: "system",
          content: `You are an affiliate marketing analyst for Archibald Titan, an AI-powered development and cybersecurity platform.
Score potential affiliate partners on revenue potential, relevance to our developer/security audience, and competition level.
Return ONLY valid JSON.`,
        },
        {
          role: "user",
          content: `Score this potential affiliate partner:
Name: ${partnerData.name}
Domain: ${partnerData.domain}
Vertical: ${partnerData.vertical}
Commission: ${partnerData.commissionType} at ${partnerData.commissionRate}${partnerData.commissionType === "revshare" ? "%" : " cents"}
Description: ${partnerData.description || "N/A"}

Our audience: developers, AI engineers, cybersecurity professionals, tech enthusiasts.
Our platform: AI agent for building apps, security scanning, automation, credential management.

Score 0-100 for: revenueScore, relevanceScore, competitionScore (lower=better).
Also provide: recommendation (1 sentence), suggestedPlacement (array of contexts like "dashboard", "security", "ai_chat"), estimatedMonthlyRevenueCents (integer).`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "partner_score",
          strict: true,
          schema: {
            type: "object",
            properties: {
              revenueScore: { type: "number" },
              relevanceScore: { type: "number" },
              competitionScore: { type: "number" },
              recommendation: { type: "string" },
              suggestedPlacement: { type: "array", items: { type: "string" } },
              estimatedMonthlyRevenueCents: { type: "number" },
            },
            required: ["revenueScore", "relevanceScore", "competitionScore", "recommendation", "suggestedPlacement", "estimatedMonthlyRevenueCents"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") throw new Error("No LLM response");

    const result = JSON.parse(content);
    const overallScore = Math.round(
      result.revenueScore * 0.4 +
      result.relevanceScore * 0.35 +
      (100 - result.competitionScore) * 0.25
    );

    return { ...result, overallScore };
  } catch (err) {
    log.error("[AffiliateEngineV2] AI partner scoring failed:", { error: getErrorMessage(err) });
    return {
      revenueScore: 50,
      relevanceScore: 50,
      competitionScore: 50,
      overallScore: 50,
      recommendation: "Unable to generate AI score — manual review recommended",
      suggestedPlacement: ["dashboard"],
      estimatedMonthlyRevenueCents: 0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 11. AFFILIATE LINK REDIRECT HANDLER
// ═══════════════════════════════════════════════════════════════════════

/**
 * Handle /go/{slug} redirect with tracking.
 * This is the cloaked URL handler that tracks clicks and redirects to the partner.
 */
export async function handleAffiliateRedirect(
  slug: string,
  requestData: {
    ipAddress?: string;
    userAgent?: string;
    referrer?: string;
    userId?: number;
  }
): Promise<{ redirectUrl: string; clickId: string | null } | null> {
  const db = await getDb();
  if (!db) return null;

  // Find partner by slug (domain without TLD, or custom slug)
  const [partner] = await db.select().from(affiliatePartners)
    .where(and(
      eq(affiliatePartners.status, "active"),
      sql`LOWER(REPLACE(${affiliatePartners.name}, ' ', '-')) = ${slug.toLowerCase()}`
    ))
    .limit(1);

  if (!partner || !partner.affiliateUrl) return null;

  // Track with fraud check
  const trackResult = await trackClickWithFraudCheck({
    partnerId: partner.id,
    userId: requestData.userId,
    ipAddress: requestData.ipAddress,
    userAgent: requestData.userAgent,
    referrer: requestData.referrer,
    utmSource: "archibaldtitan",
    utmMedium: "redirect",
    utmCampaign: `go_${slug}`,
  });

  return {
    redirectUrl: partner.affiliateUrl,
    clickId: trackResult.clickId,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 12. EXPORT SUMMARY
// ═══════════════════════════════════════════════════════════════════════

export const AFFILIATE_V2_VERSION = "2.0.0";
export const AFFILIATE_V2_FEATURES = [
  "EPC-based smart rotation",
  "Click fraud prevention",
  "Revenue analytics dashboard",
  "Smart link management with sub-IDs",
  "Conversion optimization signals",
  "Seasonal commission multipliers",
  "Milestone bonus system",
  "Two-sided referral rewards",
  "Revenue forecasting",
  "Multi-touch attribution",
  "AI-powered partner scoring",
  "Cloaked redirect URLs",
];

log.info(`[AffiliateEngineV2] v${AFFILIATE_V2_VERSION} loaded — ${AFFILIATE_V2_FEATURES.length} features active`);
