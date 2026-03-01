/**
 * Subscription Gate — Backend plan enforcement for Archibald Titan.
 *
 * Provides helpers to check a user's current plan and enforce limits
 * on fetches, providers, proxy slots, export formats, and premium features.
 */

import { eq, and, gte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { subscriptions, fetcherJobs, users } from "../drizzle/schema";
import { PRICING_TIERS, type PlanId, type PricingTier } from "../shared/pricing";

// ─── Types ─────────────────────────────────────────────────────────

export interface UserPlan {
  planId: PlanId;
  tier: PricingTier;
  status: string;
  isActive: boolean;
}

export interface PlanUsage {
  plan: UserPlan;
  fetchesUsedThisMonth: number;
  fetchesRemaining: number; // -1 = unlimited
  credentialsStored: number;
  credentialsRemaining: number; // -1 = unlimited
  proxySlotsUsed: number;
  proxySlotsRemaining: number; // -1 = unlimited
}

// ─── Get User Plan ─────────────────────────────────────────────────

export async function getUserPlan(userId: number): Promise<UserPlan> {
  const db = await getDb();
  const freeTier = PRICING_TIERS.find((t) => t.id === "free")!;
  const enterpriseTier = PRICING_TIERS.find((t) => t.id === "enterprise")!;

  if (!db) {
    return { planId: "free", tier: freeTier, status: "active", isActive: true };
  }

  // ─── Admin Bypass: admins always get full enterprise access ───
  const userResult = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Admin bypass: admins get full titan-level access (highest tier)
  const titanTier = PRICING_TIERS.find((t) => t.id === "titan")!;
  if (userResult.length > 0 && userResult[0].role === "admin") {
    return { planId: "titan", tier: titanTier, status: "active", isActive: true };
  }

  // ─── Referral Titan Unlock: temporary Titan access override ───
  const [userRecord] = await db
    .select({ titanUnlockExpiry: users.titanUnlockExpiry })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (
    userRecord?.titanUnlockExpiry &&
    new Date(userRecord.titanUnlockExpiry) > new Date()
  ) {
    // User has an active Titan unlock from referral reward
    return { planId: "titan", tier: titanTier, status: "active", isActive: true };
  }

  const sub = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (sub.length === 0 || sub[0].status === "canceled") {
    return { planId: "free", tier: freeTier, status: "active", isActive: true };
  }

  const planId = sub[0].plan as PlanId;
  const tier = PRICING_TIERS.find((t) => t.id === planId) || freeTier;
  const isActive = sub[0].status === "active" || sub[0].status === "trialing";

  // If subscription is past_due or incomplete, treat as free
  if (!isActive) {
    return { planId: "free", tier: freeTier, status: sub[0].status, isActive: false };
  }

  return { planId, tier, status: sub[0].status, isActive };
}

// ─── Get Monthly Fetch Count ───────────────────────────────────────

export async function getMonthlyFetchCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Get the start of the current month in UTC
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(fetcherJobs)
    .where(
      and(
        eq(fetcherJobs.userId, userId),
        gte(fetcherJobs.createdAt, monthStart)
      )
    );

  return result[0]?.count ?? 0;
}

// ─── Get Proxy Count ───────────────────────────────────────────────

export async function getProxyCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Import dynamically to avoid circular deps
  const { fetcherProxies } = await import("../drizzle/schema");

  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(fetcherProxies)
    .where(eq(fetcherProxies.userId, userId));

  return result[0]?.count ?? 0;
}

// ─── Get Credential Count ──────────────────────────────────────────

export async function getCredentialCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const { fetcherCredentials } = await import("../drizzle/schema");

  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(fetcherCredentials)
    .where(eq(fetcherCredentials.userId, userId));

  return result[0]?.count ?? 0;
}

// ─── Get Full Usage Report ─────────────────────────────────────────

export async function getPlanUsage(userId: number): Promise<PlanUsage> {
  const plan = await getUserPlan(userId);
  const fetchesUsed = await getMonthlyFetchCount(userId);
  const credentialsStored = await getCredentialCount(userId);
  const proxySlotsUsed = await getProxyCount(userId);

  const limits = plan.tier.limits;

  return {
    plan,
    fetchesUsedThisMonth: fetchesUsed,
    fetchesRemaining:
      limits.fetchesPerMonth === -1 ? -1 : Math.max(0, limits.fetchesPerMonth - fetchesUsed),
    credentialsStored,
    credentialsRemaining:
      limits.credentialStorage === -1 ? -1 : Math.max(0, limits.credentialStorage - credentialsStored),
    proxySlotsUsed,
    proxySlotsRemaining:
      limits.proxySlots === -1 ? -1 : Math.max(0, limits.proxySlots - proxySlotsUsed),
  };
}

// ─── Enforcement Helpers ───────────────────────────────────────────

/** Free-tier providers: first 3 alphabetically by ID */
const FREE_PROVIDER_IDS = ["aws", "azure", "gcp"];

export function getAllowedProviders(planId: PlanId): string[] | null {
  // null means all providers allowed
  if (planId === "free") return FREE_PROVIDER_IDS;
  return null; // pro & enterprise get all
}

export function isFeatureAllowed(planId: PlanId, feature: string): boolean {
  const featureMap: Record<string, PlanId[]> = {
    captcha_solving: ["pro", "enterprise", "cyber", "cyber_plus", "titan"],
    kill_switch: ["pro", "enterprise", "cyber", "cyber_plus", "titan"],
    scheduled_fetches: ["pro", "enterprise", "cyber", "cyber_plus", "titan"],
    proxy_pool: ["pro", "enterprise", "cyber", "cyber_plus", "titan"],
    env_export: ["pro", "enterprise", "cyber", "cyber_plus", "titan"],
    csv_export: ["enterprise", "cyber", "cyber_plus", "titan"],
    api_export: ["enterprise", "cyber", "cyber_plus", "titan"],
    team_management: ["enterprise", "cyber", "cyber_plus", "titan"],
    api_access: ["pro", "enterprise", "cyber", "cyber_plus", "titan"],
    developer_api: ["pro", "enterprise", "cyber", "cyber_plus", "titan"],
    webhooks: ["enterprise", "cyber", "cyber_plus", "titan"],
    sso_saml: ["enterprise", "cyber", "cyber_plus", "titan"],
    audit_logs: ["enterprise", "cyber", "cyber_plus", "titan"],
    // Cyber+ features — security tools
    leak_scanner: ["cyber", "cyber_plus", "titan"],
    credential_health: ["cyber", "cyber_plus", "titan"],
    totp_vault: ["cyber", "cyber_plus", "titan"],
    security_tools: ["cyber", "cyber_plus", "titan"],
    // Site Monitor — Pro and above
    site_monitor: ["pro", "enterprise", "cyber", "cyber_plus", "titan"],
    // Cyber+ exclusive features
    zero_click_research: ["cyber_plus", "titan"],
    c2_framework: ["cyber_plus", "titan"],
    offensive_tooling: ["cyber_plus", "titan"],
    custom_model_finetuning: ["cyber_plus", "titan"],
    multi_org: ["cyber_plus", "titan"],
    // Titan exclusive features
    dedicated_gpu: ["titan"],
    on_premise: ["titan"],
    custom_sla: ["titan"],
    compliance_certs: ["titan"],
    data_residency: ["titan"],
    priority_feature_dev: ["titan"],
  };

  const allowedPlans = featureMap[feature];
  if (!allowedPlans) return true; // Unknown features default to allowed
  return allowedPlans.includes(planId);
}

export function getAllowedExportFormats(planId: PlanId): string[] {
  const tier = PRICING_TIERS.find((t) => t.id === planId);
  return tier?.limits.exportFormats || ["json"];
}

// ─── Enforcement Checks (throw on violation) ──────────────────────

export async function enforceFetchLimit(userId: number): Promise<void> {
  const plan = await getUserPlan(userId);
  if (plan.tier.limits.fetchesPerMonth === -1) return; // unlimited

  const used = await getMonthlyFetchCount(userId);
  if (used >= plan.tier.limits.fetchesPerMonth) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You've reached your monthly fetch limit (${plan.tier.limits.fetchesPerMonth} fetches on the ${plan.tier.name} plan). Upgrade to Pro for unlimited fetches.`,
    });
  }
}

export async function enforceProviderAccess(userId: number, providerIds: string[]): Promise<void> {
  const plan = await getUserPlan(userId);
  const allowed = getAllowedProviders(plan.planId);
  if (!allowed) return; // all providers allowed

  const blocked = providerIds.filter((id) => !allowed.includes(id));
  if (blocked.length > 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `The ${plan.tier.name} plan only includes ${allowed.length} providers (${allowed.join(", ")}). Upgrade to Pro to access all 15+ providers including ${blocked.join(", ")}.`,
    });
  }
}

export async function enforceProxySlotLimit(userId: number): Promise<void> {
  const plan = await getUserPlan(userId);
  if (plan.tier.limits.proxySlots === -1) return; // unlimited
  if (plan.tier.limits.proxySlots === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Proxy pool is not available on the ${plan.tier.name} plan. Upgrade to Pro to add up to 5 proxy slots.`,
    });
  }

  const count = await getProxyCount(userId);
  if (count >= plan.tier.limits.proxySlots) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You've reached your proxy slot limit (${plan.tier.limits.proxySlots} on the ${plan.tier.name} plan). Upgrade to Enterprise for unlimited proxy slots.`,
    });
  }
}

export async function enforceCredentialLimit(userId: number): Promise<void> {
  const plan = await getUserPlan(userId);
  if (plan.tier.limits.credentialStorage === -1) return; // unlimited

  const count = await getCredentialCount(userId);
  if (count >= plan.tier.limits.credentialStorage) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You've reached your credential storage limit (${plan.tier.limits.credentialStorage} on the ${plan.tier.name} plan). Upgrade to Pro for unlimited credential storage.`,
    });
  }
}

export function enforceExportFormat(planId: PlanId, format: string): void {
  const allowed = getAllowedExportFormats(planId);
  if (!allowed.includes(format)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${format.toUpperCase()} export is not available on the ${PRICING_TIERS.find((t) => t.id === planId)?.name || "Free"} plan. Upgrade to access this export format.`,
    });
  }
}

export function enforceFeature(planId: PlanId, feature: string, featureLabel: string): void {
  if (!isFeatureAllowed(planId, feature)) {
    const tier = PRICING_TIERS.find((t) => t.id === planId);
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${featureLabel} is not available on the ${tier?.name || "Free"} plan. Upgrade to unlock this feature.`,
    });
  }
}

// ─── Clone Website Gate ────────────────────────────────────────────
// Clone Website is a premium exclusive feature for Cyber+ and Titan tiers only.
// Returns true if the user can access the clone website feature.
export async function canUseCloneWebsite(userId: number): Promise<boolean> {
  const userPlan = await getUserPlan(userId);
  const allowedPlans: string[] = ["cyber_plus", "titan"];
  // Admins always have access
  if (userPlan.planId === "titan") return true;
  return allowedPlans.includes(userPlan.planId) && userPlan.isActive;
}

