/**
 * Autonomous Affiliate Marketing Engine for Archibald Titan
 * 
 * STRATEGY: Maximum revenue, zero ad spend.
 * 
 * Revenue streams:
 * 1. Affiliate commissions — contextually recommend tools users already need
 * 2. Viral referral program — users market for free (5 verified sign-ups = 30% off first month)
 * 3. Cross-promotion deals — trade visibility, never pay for ads
 * 4. AI-powered partner outreach — auto-apply to high-paying programs
 * 5. Smart placement optimization — show right partner at right moment
 */

import { invokeLLM } from "./_core/llm";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  affiliatePartners,
  affiliateClicks,
  referralCodes,
  referralConversions,
  affiliatePayouts,
  affiliateOutreach,
  users,
  type InsertAffiliatePartner,
} from "../drizzle/schema";
import { randomBytes } from "crypto";
import { createLogger } from "./_core/logger.js";
const log = createLogger("AffiliateEngine");

// ─── Known High-Paying Affiliate Programs ───────────────────────────

export const KNOWN_AFFILIATE_PROGRAMS: InsertAffiliatePartner[] = [
  // ═══ AI Tools (highest relevance to Titan users) ═══
  { name: "OpenAI", domain: "openai.com", vertical: "ai_tools", commissionType: "revshare", commissionRate: 15, applicationUrl: "https://openai.com/affiliates", affiliateUrl: "https://openai.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=ai_tools", contactEmail: "affiliates@openai.com" },
  { name: "Anthropic", domain: "anthropic.com", vertical: "ai_tools", commissionType: "cpa", commissionRate: 2500, applicationUrl: "https://anthropic.com/partners", affiliateUrl: "https://www.anthropic.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=ai_tools", contactEmail: "partnerships@anthropic.com" },
  { name: "Midjourney", domain: "midjourney.com", vertical: "ai_tools", commissionType: "revshare", commissionRate: 20, applicationUrl: "https://midjourney.com/affiliate", affiliateUrl: "https://www.midjourney.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=ai_tools" },
  { name: "Runway ML", domain: "runwayml.com", vertical: "ai_tools", commissionType: "cpa", commissionRate: 3000, applicationUrl: "https://runwayml.com/partners", affiliateUrl: "https://runwayml.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=ai_tools" },
  { name: "Jasper AI", domain: "jasper.ai", vertical: "ai_tools", commissionType: "revshare", commissionRate: 25, applicationUrl: "https://jasper.ai/partners", affiliateUrl: "https://www.jasper.ai/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=ai_tools", contactEmail: "partners@jasper.ai" },
  { name: "Copy.ai", domain: "copy.ai", vertical: "ai_tools", commissionType: "revshare", commissionRate: 30, applicationUrl: "https://copy.ai/affiliates", affiliateUrl: "https://www.copy.ai/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=ai_tools" },
  { name: "Synthesia", domain: "synthesia.io", vertical: "ai_tools", commissionType: "cpa", commissionRate: 5000, applicationUrl: "https://synthesia.io/partners", affiliateUrl: "https://www.synthesia.io/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=ai_tools" },
  { name: "ElevenLabs", domain: "elevenlabs.io", vertical: "ai_tools", commissionType: "revshare", commissionRate: 22, applicationUrl: "https://elevenlabs.io/affiliate", affiliateUrl: "https://elevenlabs.io/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=ai_tools" },
  // ═══ Hosting & Cloud (users deploying apps — HIGH CPA) ═══
  { name: "Hostinger", domain: "hostinger.com", vertical: "hosting", commissionType: "cpa", commissionRate: 15000, applicationUrl: "https://www.hostinger.com/affiliates", affiliateUrl: "https://www.hostinger.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=hosting" },
  { name: "Bluehost", domain: "bluehost.com", vertical: "hosting", commissionType: "cpa", commissionRate: 6500, applicationUrl: "https://www.bluehost.com/affiliates", affiliateUrl: "https://www.bluehost.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=hosting" },
  { name: "Cloudways", domain: "cloudways.com", vertical: "hosting", commissionType: "cpa", commissionRate: 12500, applicationUrl: "https://www.cloudways.com/en/affiliate.php", affiliateUrl: "https://www.cloudways.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=hosting" },
  { name: "Vercel", domain: "vercel.com", vertical: "hosting", commissionType: "cpa", commissionRate: 5000, applicationUrl: "https://vercel.com/partners", affiliateUrl: "https://vercel.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=hosting", contactEmail: "partners@vercel.com" },
  { name: "DigitalOcean", domain: "digitalocean.com", vertical: "hosting", commissionType: "cpa", commissionRate: 20000, applicationUrl: "https://www.digitalocean.com/affiliates", affiliateUrl: "https://www.digitalocean.com/?refcode=archibaldtitan&utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=hosting" },
  { name: "Cloudflare", domain: "cloudflare.com", vertical: "hosting", commissionType: "revshare", commissionRate: 15, applicationUrl: "https://cloudflare.com/partners", affiliateUrl: "https://www.cloudflare.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=hosting" },
  { name: "Railway", domain: "railway.app", vertical: "hosting", commissionType: "revshare", commissionRate: 20, applicationUrl: "https://railway.app/affiliate", affiliateUrl: "https://railway.app/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=hosting" },
  { name: "Render", domain: "render.com", vertical: "hosting", commissionType: "cpa", commissionRate: 5000, applicationUrl: "https://render.com/partners", affiliateUrl: "https://render.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=hosting" },
  { name: "AWS", domain: "aws.amazon.com", vertical: "hosting", commissionType: "cpa", commissionRate: 10000, applicationUrl: "https://aws.amazon.com/partners", affiliateUrl: "https://aws.amazon.com/free/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=hosting" },
  // ═══ VPN & Security (HIGHEST CPA — $40-$100 per sale) ═══
  { name: "NordVPN", domain: "nordvpn.com", vertical: "vpn", commissionType: "cpa", commissionRate: 10000, applicationUrl: "https://nordvpn.com/affiliate/", affiliateUrl: process.env.NORDVPN_AFF_ID ? `https://go.nordvpn.net/aff_c?offer_id=15&aff_id=${process.env.NORDVPN_AFF_ID}&url_id=902` : "https://nordvpn.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=vpn" },
  { name: "Hak5", domain: "shop.hak5.org", vertical: "security", commissionType: "revshare", commissionRate: 15, applicationUrl: "https://shop.hak5.org/pages/affiliates", affiliateUrl: process.env.HAK5_AFF_ID ? `https://shop.hak5.org/?ref=${process.env.HAK5_AFF_ID}` : "https://shop.hak5.org/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=security" },
  { name: "AnyDesk", domain: "anydesk.com", vertical: "dev_tools", commissionType: "revshare", commissionRate: 25, applicationUrl: "https://anydesk.com/en/partners", affiliateUrl: process.env.ANYDESK_AFF_ID ? `https://anydesk.com/en?ref=${process.env.ANYDESK_AFF_ID}` : "https://anydesk.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=remote" },
  { name: "ExpressVPN", domain: "expressvpn.com", vertical: "vpn", commissionType: "cpa", commissionRate: 3600, applicationUrl: "https://www.expressvpn.com/affiliates", affiliateUrl: "https://www.expressvpn.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=vpn" },
  { name: "Surfshark", domain: "surfshark.com", vertical: "vpn", commissionType: "revshare", commissionRate: 40, applicationUrl: "https://surfshark.com/affiliate", affiliateUrl: "https://surfshark.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=vpn" },
  { name: "CyberGhost", domain: "cyberghostvpn.com", vertical: "vpn", commissionType: "cpa", commissionRate: 4500, applicationUrl: "https://www.cyberghostvpn.com/en_US/affiliates", affiliateUrl: "https://www.cyberghostvpn.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=vpn" },
  { name: "1Password", domain: "1password.com", vertical: "security", commissionType: "revshare", commissionRate: 25, applicationUrl: "https://1password.com/partnerships", affiliateUrl: "https://1password.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=security" },
  { name: "Bitwarden", domain: "bitwarden.com", vertical: "security", commissionType: "cpa", commissionRate: 2000, applicationUrl: "https://bitwarden.com/partners", affiliateUrl: "https://bitwarden.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=security" },
  // ═══ Dev Tools (Titan users are developers) ═══
  { name: "GitHub", domain: "github.com", vertical: "dev_tools", commissionType: "cpa", commissionRate: 2500, applicationUrl: "https://github.com/partners", affiliateUrl: "https://github.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=dev_tools" },
  { name: "Supabase", domain: "supabase.com", vertical: "dev_tools", commissionType: "revshare", commissionRate: 20, applicationUrl: "https://supabase.com/partners", affiliateUrl: "https://supabase.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=dev_tools" },
  { name: "PlanetScale", domain: "planetscale.com", vertical: "dev_tools", commissionType: "cpa", commissionRate: 5000, applicationUrl: "https://planetscale.com/partners", affiliateUrl: "https://planetscale.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=dev_tools" },
  { name: "Stripe", domain: "stripe.com", vertical: "dev_tools", commissionType: "cpa", commissionRate: 5000, applicationUrl: "https://stripe.com/partners", affiliateUrl: "https://stripe.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=dev_tools" },
  { name: "Postman", domain: "postman.com", vertical: "dev_tools", commissionType: "cpa", commissionRate: 2000, applicationUrl: "https://postman.com/partners", affiliateUrl: "https://www.postman.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=dev_tools" },
  { name: "Figma", domain: "figma.com", vertical: "dev_tools", commissionType: "revshare", commissionRate: 15, applicationUrl: "https://figma.com/partners", affiliateUrl: "https://www.figma.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=dev_tools" },
  // ═══ SEO & Marketing Tools (VERY HIGH CPA — $200/sale) ═══
  { name: "Semrush", domain: "semrush.com", vertical: "saas", commissionType: "cpa", commissionRate: 20000, applicationUrl: "https://www.semrush.com/affiliate-program/", affiliateUrl: "https://www.semrush.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=marketing" },
  { name: "Ahrefs", domain: "ahrefs.com", vertical: "saas", commissionType: "revshare", commissionRate: 20, applicationUrl: "https://ahrefs.com/affiliates", affiliateUrl: "https://ahrefs.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=marketing" },
  // ═══ SaaS (high lifetime value) ═══
  { name: "Notion", domain: "notion.so", vertical: "saas", commissionType: "cpa", commissionRate: 5000, applicationUrl: "https://notion.so/affiliates", affiliateUrl: "https://www.notion.so/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=saas" },
  { name: "Airtable", domain: "airtable.com", vertical: "saas", commissionType: "revshare", commissionRate: 20, applicationUrl: "https://airtable.com/partners", affiliateUrl: "https://airtable.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=saas" },
  { name: "Zapier", domain: "zapier.com", vertical: "saas", commissionType: "revshare", commissionRate: 25, applicationUrl: "https://zapier.com/l/partners", affiliateUrl: "https://zapier.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=saas" },
  { name: "HubSpot", domain: "hubspot.com", vertical: "saas", commissionType: "revshare", commissionRate: 30, applicationUrl: "https://www.hubspot.com/partners/affiliates", affiliateUrl: "https://www.hubspot.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=saas" },
  { name: "Monday.com", domain: "monday.com", vertical: "saas", commissionType: "cpa", commissionRate: 10000, applicationUrl: "https://monday.com/affiliates", affiliateUrl: "https://monday.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=saas" },
  // ═══ Education (recurring commissions) ═══
  { name: "Udemy", domain: "udemy.com", vertical: "education", commissionType: "revshare", commissionRate: 15, applicationUrl: "https://www.udemy.com/affiliate/", affiliateUrl: "https://www.udemy.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=education" },
  { name: "Coursera", domain: "coursera.org", vertical: "education", commissionType: "revshare", commissionRate: 20, applicationUrl: "https://www.coursera.org/about/affiliates", affiliateUrl: "https://www.coursera.org/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=education" },
  { name: "Skillshare", domain: "skillshare.com", vertical: "education", commissionType: "cpa", commissionRate: 700, applicationUrl: "https://www.skillshare.com/affiliates", affiliateUrl: "https://www.skillshare.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=education" },
  // ═══ Crypto (very high CPA) ═══
  { name: "Coinbase", domain: "coinbase.com", vertical: "crypto", commissionType: "cpa", commissionRate: 1000, applicationUrl: "https://coinbase.com/affiliates", affiliateUrl: "https://www.coinbase.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=crypto" },
  { name: "Binance", domain: "binance.com", vertical: "crypto", commissionType: "revshare", commissionRate: 40, applicationUrl: "https://binance.com/affiliate", affiliateUrl: "https://accounts.binance.com/register?ref=1197740486" },
  { name: "Bybit", domain: "bybit.com", vertical: "crypto", commissionType: "revshare", commissionRate: 30, applicationUrl: "https://www.bybit.com/affiliates", affiliateUrl: "https://www.bybit.com/?utm_source=archibaldtitan&utm_medium=affiliate&utm_campaign=crypto" },
  // ═══ Affiliate Networks (multi-offer aggregators — HIGH VOLUME) ═══
  { name: "OfferOne (Scaleo)", domain: "offerone.scaleo.app", vertical: "other", commissionType: "hybrid", commissionRate: 25, applicationUrl: "https://offerone.scaleo.app/auth/signup-affiliate?ref=2218", affiliateUrl: "https://offerone.scaleo.app/auth/signup-affiliate?ref=2218", contactEmail: "Archibaldtitan@gmail.com" },
];

// ─── Referral Program Config ────────────────────────────────────────

export const REFERRAL_CONFIG = {
  // ─── Deal 1: Volume Referral Reward ───
  // 5 verified sign-ups = 30% off the referrer's next month payment (one-time)
  referralsForDiscount: 5,
  discountPercent: 30,
  discountOneTime: true, // only applies to the FIRST month after qualifying
  // ─── Deal 2: High-Value Referral Reward ───
  // If a referred user subscribes to Cyber or above, the referrer gets
  // 50% off their second year Pro membership (paid annually, one-time)
  highValueReferral: {
    qualifyingPlans: ["cyber", "cyber_plus", "titan"] as const, // referred user must subscribe to one of these
    rewardPlan: "pro" as const,                                 // referrer gets discount on Pro
    rewardInterval: "year" as const,                             // annual billing only
    rewardDiscountPercent: 50,                                   // 50% off
    rewardAppliesTo: "second_year" as const,                     // applies to their 2nd year renewal
    oneTimeOnly: true,                                           // cannot stack or repeat
  },
  // ─── Deal 3: Titan Referral Reward ───
  // Refer a user who subscribes to Titan tier → referrer gets 3 months of Titan features unlocked
  titanReferral: {
    qualifyingPlans: ["titan"] as const,       // referred user must subscribe to Titan specifically
    rewardDurationMonths: 3,                   // 3 months of Titan features
    rewardType: "titan_unlock" as const,       // temporary Titan tier access
    oneTimeOnly: true,                         // one-time reward per referrer
    requiresPayment: true,                     // referred user must have actually paid (not just signed up)
  },
  // ─── Recurring Commission Model ───
  // Affiliates earn a % of every payment their referrals make for 12 months
  baseCommissionPercent: 10,
  commissionDurationMonths: 12,
  maxReferralRewardsPerMonth: 50,
  minPayoutCents: 5000, // $50 minimum payout threshold
  codePrefix: "TITAN",
  // ─── Payout Options ───
  payoutOptions: ["wire_transfer", "credits"] as const,
  creditBonusMultiplier: 1.5, // 1.5x bonus if payout taken as platform credits
  // ─── Tiered Commission Structure ───
  // Top performers earn more — incentivizes serious promotion
  tiers: [
    { name: "Starter", minReferrals: 0, commissionPercent: 10, badge: "\u26A1", perks: "10% recurring commission for 12 months" },
    { name: "Advocate", minReferrals: 10, commissionPercent: 12, badge: "\uD83D\uDD25", perks: "12% commission + priority support" },
    { name: "Champion", minReferrals: 25, commissionPercent: 15, badge: "\uD83C\uDFC6", perks: "15% commission + custom landing page" },
    { name: "Ambassador", minReferrals: 50, commissionPercent: 18, badge: "\uD83D\uDC8E", perks: "18% commission + co-branded marketing" },
    { name: "Titan Elite", minReferrals: 100, commissionPercent: 22, badge: "\uD83D\uDC51", perks: "22% commission + dedicated account manager + early access" },
  ],
};

// ─── Contextual Placement Mapping ───────────────────────────────────
// Maps user actions to the most relevant affiliate partners
// This is the zero-cost monetization strategy: show the right partner
// at the exact moment the user needs that tool.

export const CONTEXTUAL_PLACEMENTS: Record<string, string[]> = {
  // When user is building an app → recommend hosting (highest CPA first)
  "app_builder": ["digitalocean.com", "hostinger.com", "cloudways.com", "vercel.com", "railway.app"],
  // When user asks about AI → recommend AI tools
  "ai_chat": ["synthesia.io", "openai.com", "anthropic.com", "elevenlabs.io", "midjourney.com"],
  // When user works with databases → recommend DB tools
  "database": ["supabase.com", "planetscale.com", "digitalocean.com", "aws.amazon.com"],
  // When user works with APIs → recommend dev tools
  "api_integration": ["stripe.com", "postman.com", "github.com", "supabase.com"],
  // When user works with design → recommend design tools
  "design": ["figma.com", "midjourney.com", "synthesia.io", "copy.ai"],
  // When user works with content → recommend content tools
  "content_creation": ["synthesia.io", "jasper.ai", "copy.ai", "elevenlabs.io", "semrush.com"],
  // When user works with security → recommend VPN & security (HIGHEST CPA)
  "security": ["nordvpn.com", "shop.hak5.org", "expressvpn.com", "surfshark.com", "1password.com", "bitwarden.com", "cloudflare.com"],
  // When user works with remote access → recommend remote tools
  "remote_access": ["anydesk.com", "nordvpn.com", "1password.com"],
  // When user works with pentesting hardware → recommend Hak5
  "pentesting": ["shop.hak5.org", "nordvpn.com", "1password.com", "bitwarden.com"],
  // When user works with automation → recommend automation tools
  "automation": ["monday.com", "zapier.com", "hubspot.com", "airtable.com", "notion.so"],
  // Developer docs/tools → recommend dev tools and hosting
  "developer": ["digitalocean.com", "github.com", "supabase.com", "stripe.com", "vercel.com", "semrush.com"],
  // Landing page visitors → show HIGHEST-PAYING partners first
  "landing": ["semrush.com", "digitalocean.com", "hostinger.com", "nordvpn.com", "monday.com", "synthesia.io"],
  // Sandbox users → recommend hosting and dev tools
  "sandbox": ["digitalocean.com", "hostinger.com", "cloudways.com", "railway.app", "vercel.com", "aws.amazon.com"],
  // Subscription/pricing page → recommend highest-value SaaS
  "subscription": ["monday.com", "hubspot.com", "semrush.com", "zapier.com", "nordvpn.com"],
  // AI tools page → recommend AI tools (highest commission first)
  "ai_tools": ["synthesia.io", "jasper.ai", "copy.ai", "elevenlabs.io", "openai.com", "midjourney.com"],
  // General dashboard → rotate HIGHEST-PAYING partners
  "dashboard": ["semrush.com", "digitalocean.com", "hostinger.com", "nordvpn.com", "monday.com", "hubspot.com"],
  // VPN-specific context
  "vpn": ["nordvpn.com", "expressvpn.com", "surfshark.com", "cyberghostvpn.com"],
  // Hardware pentesting tools
  "hardware": ["shop.hak5.org", "nordvpn.com"],
  // Marketing context
  "marketing": ["semrush.com", "ahrefs.com", "hubspot.com", "monday.com", "copy.ai"],
  // Crypto context
  "crypto": ["binance.com", "coinbase.com", "bybit.com"],
  // Education context
  "education": ["coursera.org", "udemy.com", "skillshare.com"],
};

// ─── Core Engine Functions ──────────────────────────────────────────

/**
 * Seed known affiliate programs into the database
 */
export async function seedAffiliatePrograms(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  let seeded = 0;
  let updated = 0;
  for (const program of KNOWN_AFFILIATE_PROGRAMS) {
    const existing = await db.select().from(affiliatePartners)
      .where(eq(affiliatePartners.domain, program.domain!))
      .limit(1);
    if (existing.length === 0) {
      // Auto-activate all seeded programs — zero friction affiliate empire
      await db.insert(affiliatePartners).values({ ...program, status: "active" });
      seeded++;
    } else if (program.affiliateUrl && !existing[0].affiliateUrl) {
      // Update existing partners with affiliate URLs if they don't have one
      await db.update(affiliatePartners)
        .set({ affiliateUrl: program.affiliateUrl, applicationUrl: program.applicationUrl })
        .where(eq(affiliatePartners.id, existing[0].id));
      updated++;
    }
  }

  // Auto-activate any remaining prospects
  await db.update(affiliatePartners)
    .set({ status: "active" })
    .where(eq(affiliatePartners.status, "prospect"));

  log.info(`[AffiliateEngine] Seeded ${seeded} new, updated ${updated} existing affiliate programs (all auto-activated)`);

  // Auto-generate outreach for all partners without outreach
  if (seeded > 0) {
    generateBulkOutreach().catch(err => 
      log.error("[AffiliateEngine] Bulk outreach generation failed:", { error: String(err) })
    );
  }

  return seeded;
}

/**
 * Generate outreach emails for all partners that don't have one yet
 */
export async function generateBulkOutreach(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const allPartners = await db.select().from(affiliatePartners);
  const existingOutreach = await db.select({ partnerId: affiliateOutreach.partnerId }).from(affiliateOutreach);
  const outreachedIds = new Set(existingOutreach.map(o => o.partnerId));

  let generated = 0;
  for (const partner of allPartners) {
    if (!outreachedIds.has(partner.id)) {
      try {
        await generateOutreachEmail(partner.id);
        generated++;
        log.info(`[AffiliateEngine] Generated outreach for ${partner.name} (${generated}/${allPartners.length - outreachedIds.size})`);
      } catch (error) {
        log.error(`[AffiliateEngine] Failed outreach for ${partner.name}:`, { error: String(error) });
      }
    }
  }

  log.info(`[AffiliateEngine] Bulk outreach complete: ${generated} emails generated`);
  return generated;
}

/**
 * Generate a unique referral code for a user
 */
export async function generateReferralCode(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if user already has a code
  const existing = await db.select().from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1);
  if (existing.length > 0) return existing[0].code;

  // Generate unique code
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  const code = `${REFERRAL_CONFIG.codePrefix}${suffix}`;

  await db.insert(referralCodes).values({ userId, code });
  return code;
}

/**
 * Track a referral signup — the viral growth engine
 */
export async function trackReferralSignup(
  referralCode: string,
  newUserId: number
): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database not available" };

  const [codeRecord] = await db.select().from(referralCodes)
    .where(eq(referralCodes.code, referralCode))
    .limit(1);

  if (!codeRecord || !codeRecord.isActive) {
    return { success: false, message: "Invalid or inactive referral code" };
  }

  if (codeRecord.userId === newUserId) {
    return { success: false, message: "Cannot refer yourself" };
  }

  // Check for duplicate
  const existingConversion = await db.select().from(referralConversions)
    .where(eq(referralConversions.referredUserId, newUserId))
    .limit(1);
  if (existingConversion.length > 0) {
    return { success: false, message: "User already referred" };
  }

  // Record the conversion — status is "signed_up" (verified account creation)
  await db.insert(referralConversions).values({
    referralCodeId: codeRecord.id,
    referrerId: codeRecord.userId,
    referredUserId: newUserId,
    status: "signed_up",
    rewardType: "discount",
    rewardAmountCents: 0,
  });

  // Increment referral count
  await db.update(referralCodes)
    .set({ totalReferrals: sql`${referralCodes.totalReferrals} + 1` })
    .where(eq(referralCodes.id, codeRecord.id));

  // Check if referrer has reached 5 verified sign-ups → 30% off first month
  const [updatedCode] = await db.select().from(referralCodes)
    .where(eq(referralCodes.id, codeRecord.id))
    .limit(1);
  const totalRefs = updatedCode?.totalReferrals || 0;

  if (totalRefs === REFERRAL_CONFIG.referralsForDiscount && (updatedCode?.totalRewardsEarned || 0) === 0) {
    // Mark that the discount has been earned (one-time only)
    await db.update(referralCodes)
      .set({ totalRewardsEarned: 1 })
      .where(eq(referralCodes.id, codeRecord.id));
    log.info(`[AffiliateEngine] User ${codeRecord.userId} earned ${REFERRAL_CONFIG.discountPercent}% off first month! (${totalRefs} verified referrals)`);
    return { success: true, message: `Referral tracked! You've hit ${totalRefs} referrals — you've earned ${REFERRAL_CONFIG.discountPercent}% off your next month!` };
  }

  const remaining = Math.max(0, REFERRAL_CONFIG.referralsForDiscount - totalRefs);
  return { success: true, message: `Referral tracked! ${totalRefs} total referrals.${remaining > 0 ? ` ${remaining} more to unlock ${REFERRAL_CONFIG.discountPercent}% off!` : ""}` };
}

/**
 * Check if a referred user just subscribed to Cyber+ and award the referrer
 * 50% off their second year Pro annual membership.
 * Called from the Stripe webhook when a new subscription is created.
 */
export async function checkHighValueReferralReward(
  subscribedUserId: number,
  planId: string
): Promise<{ rewarded: boolean; referrerId?: number; message: string }> {
  const db = await getDb();
  if (!db) return { rewarded: false, message: "Database not available" };

  const hvr = REFERRAL_CONFIG.highValueReferral;

  // Only trigger for qualifying plans (cyber, cyber_plus, titan)
  if (!(hvr.qualifyingPlans as readonly string[]).includes(planId)) {
    return { rewarded: false, message: "Plan does not qualify for high-value referral reward" };
  }

  // Find if this user was referred by someone
  const [conversion] = await db.select().from(referralConversions)
    .where(eq(referralConversions.referredUserId, subscribedUserId))
    .limit(1);

  if (!conversion) {
    return { rewarded: false, message: "User was not referred" };
  }

  // Check if the referrer already received this reward (one-time only)
  const existingReward = await db.select().from(referralConversions)
    .where(
      and(
        eq(referralConversions.referrerId, conversion.referrerId),
        eq(referralConversions.rewardType, "high_value_discount")
      )
    )
    .limit(1);

  if (existingReward.length > 0) {
    return { rewarded: false, message: "Referrer already received high-value reward" };
  }

  // Update the conversion record to mark the reward
  await db.update(referralConversions)
    .set({
      status: "rewarded",
      rewardType: "high_value_discount",
      rewardGrantedAt: new Date(),
    })
    .where(eq(referralConversions.id, conversion.id));

  log.info(
    `[AffiliateEngine] HIGH-VALUE REFERRAL: User ${conversion.referrerId} earned ` +
    `${hvr.rewardDiscountPercent}% off ${hvr.rewardPlan} annual (${hvr.rewardAppliesTo}) ` +
    `because referred user ${subscribedUserId} subscribed to ${planId}`
  );

  return {
    rewarded: true,
    referrerId: conversion.referrerId,
    message: `Referrer ${conversion.referrerId} earned ${hvr.rewardDiscountPercent}% off Pro annual for their second year!`,
  };
}

/**
 * Check if a referred user just subscribed to Titan and award the referrer
 * 3 months of unlocked Titan features (temporary tier override).
 * Called from the Stripe webhook when a new subscription is created.
 */
export async function checkTitanReferralReward(
  subscribedUserId: number,
  planId: string
): Promise<{ rewarded: boolean; referrerId?: number; message: string }> {
  const db = await getDb();
  if (!db) return { rewarded: false, message: "Database not available" };

  const tr = REFERRAL_CONFIG.titanReferral;

  // Only trigger for Titan plan subscriptions
  if (!(tr.qualifyingPlans as readonly string[]).includes(planId)) {
    return { rewarded: false, message: "Plan does not qualify for Titan referral reward" };
  }

  // Find if this user was referred by someone
  const [conversion] = await db.select().from(referralConversions)
    .where(eq(referralConversions.referredUserId, subscribedUserId))
    .limit(1);

  if (!conversion) {
    return { rewarded: false, message: "User was not referred" };
  }

  // Check if the referrer already received this reward (one-time only)
  const existingReward = await db.select().from(referralConversions)
    .where(
      and(
        eq(referralConversions.referrerId, conversion.referrerId),
        eq(referralConversions.rewardType, "tier_upgrade")
      )
    )
    .limit(1);

  if (existingReward.length > 0) {
    return { rewarded: false, message: "Referrer already received Titan unlock reward" };
  }

  // Calculate expiry: 3 months from now
  const expiryDate = new Date();
  expiryDate.setMonth(expiryDate.getMonth() + tr.rewardDurationMonths);

  // Set the Titan unlock on the referrer's user record
  await db.update(users)
    .set({
      titanUnlockExpiry: expiryDate,
      titanUnlockGrantedBy: subscribedUserId,
    })
    .where(eq(users.id, conversion.referrerId));

  // Record the reward in the conversion table
  await db.update(referralConversions)
    .set({
      status: "rewarded",
      rewardType: "tier_upgrade",
      rewardGrantedAt: new Date(),
    })
    .where(eq(referralConversions.id, conversion.id));

  log.info(
    `[AffiliateEngine] TITAN REFERRAL UNLOCK: User ${conversion.referrerId} earned ` +
    `${tr.rewardDurationMonths} months of Titan features (expires ${expiryDate.toISOString()}) ` +
    `because referred user ${subscribedUserId} subscribed to ${planId}`
  );

  return {
    rewarded: true,
    referrerId: conversion.referrerId,
    message: `Referrer ${conversion.referrerId} earned ${tr.rewardDurationMonths} months of Titan features!`,
  };
}

/**
 * Track an affiliate click — every outbound click to a partner
 */
export async function trackAffiliateClick(data: {
  partnerId: number;
  userId?: number;
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const clickId = randomBytes(16).toString("hex");

  await db.insert(affiliateClicks).values({
    partnerId: data.partnerId,
    userId: data.userId,
    clickId,
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
    referrer: data.referrer,
    utmSource: data.utmSource,
    utmMedium: data.utmMedium,
    utmCampaign: data.utmCampaign,
  });

  await db.update(affiliatePartners)
    .set({ totalClicks: sql`${affiliatePartners.totalClicks} + 1` })
    .where(eq(affiliatePartners.id, data.partnerId));

  return clickId;
}

/**
 * Track a conversion (when a referred user makes a purchase through partner)
 */
export async function trackConversion(
  clickId: string,
  commissionCents: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [click] = await db.select().from(affiliateClicks)
    .where(eq(affiliateClicks.clickId, clickId))
    .limit(1);

  if (!click) throw new Error("Click not found");

  await db.update(affiliateClicks)
    .set({
      converted: true,
      conversionDate: new Date(),
      commissionEarned: commissionCents,
    })
    .where(eq(affiliateClicks.clickId, clickId));

  await db.update(affiliatePartners)
    .set({
      totalConversions: sql`${affiliatePartners.totalConversions} + 1`,
      totalEarnings: sql`${affiliatePartners.totalEarnings} + ${commissionCents}`,
    })
    .where(eq(affiliatePartners.id, click.partnerId));
}

/**
 * Get contextual partner recommendations based on what the user is doing
 * This is the zero-cost monetization: right partner, right moment
 */
export async function getContextualRecommendations(
  context: string,
  limit: number = 3
): Promise<Array<{
  id: number;
  name: string;
  domain: string | null;
  affiliateUrl: string | null;
  commissionType: string;
  vertical: string;
}>> {
  const db = await getDb();
  if (!db) return [];

  const domains = CONTEXTUAL_PLACEMENTS[context] || CONTEXTUAL_PLACEMENTS["dashboard"];
  if (!domains || domains.length === 0) return [];

  const results = [];
  for (const domain of domains) {
    const [partner] = await db.select({
      id: affiliatePartners.id,
      name: affiliatePartners.name,
      domain: affiliatePartners.domain,
      affiliateUrl: affiliatePartners.affiliateUrl,
      commissionType: affiliatePartners.commissionType,
      vertical: affiliatePartners.vertical,
    }).from(affiliatePartners)
      .where(and(
        eq(affiliatePartners.domain, domain),
        eq(affiliatePartners.status, "active")
      ))
      .limit(1);

    if (partner) results.push(partner);
    if (results.length >= limit) break;
  }

  // If not enough active partners, fill with highest-earning active partners
  if (results.length < limit) {
    const existingIds = results.map((r: { id: number }) => r.id);
    const fillers = await db.select({
      id: affiliatePartners.id,
      name: affiliatePartners.name,
      domain: affiliatePartners.domain,
      affiliateUrl: affiliatePartners.affiliateUrl,
      commissionType: affiliatePartners.commissionType,
      vertical: affiliatePartners.vertical,
    }).from(affiliatePartners)
      .where(eq(affiliatePartners.status, "active"))
      .orderBy(desc(affiliatePartners.totalEarnings))
      .limit(limit - results.length);

    for (const filler of fillers) {
      if (!existingIds.includes(filler.id)) {
        results.push(filler);
      }
    }
  }

  return results;
}

/**
 * Get aggregate affiliate stats
 */
export async function getAffiliateStats(): Promise<{
  totalPartners: number;
  activePartners: number;
  totalClicks: number;
  totalConversions: number;
  totalEarningsCents: number;
  conversionRate: number;
  totalReferrals: number;
  totalReferralRewards: number;
  estimatedMonthlyRevenueCents: number;
}> {
  const db = await getDb();
  if (!db) return {
    totalPartners: 0, activePartners: 0, totalClicks: 0, totalConversions: 0,
    totalEarningsCents: 0, conversionRate: 0, totalReferrals: 0, totalReferralRewards: 0,
    estimatedMonthlyRevenueCents: 0,
  };

  const [partnerStats] = await db.select({
    total: sql<number>`COUNT(*)`,
    active: sql<number>`SUM(CASE WHEN ${affiliatePartners.status} = 'active' THEN 1 ELSE 0 END)`,
    clicks: sql<number>`SUM(${affiliatePartners.totalClicks})`,
    conversions: sql<number>`SUM(${affiliatePartners.totalConversions})`,
    earnings: sql<number>`SUM(${affiliatePartners.totalEarnings})`,
  }).from(affiliatePartners);

  const [refStats] = await db.select({
    totalReferrals: sql<number>`SUM(${referralCodes.totalReferrals})`,
    totalRewards: sql<number>`SUM(${referralCodes.totalRewardsEarned})`,
  }).from(referralCodes);

  const totalClicks = Number(partnerStats?.clicks || 0);
  const totalConversions = Number(partnerStats?.conversions || 0);
  const totalEarnings = Number(partnerStats?.earnings || 0);

  // Estimate monthly revenue based on last 30 days trend
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [recentEarnings] = await db.select({
    earnings: sql<number>`SUM(${affiliateClicks.commissionEarned})`,
  }).from(affiliateClicks)
    .where(and(
      eq(affiliateClicks.converted, true),
      gte(affiliateClicks.createdAt, thirtyDaysAgo)
    ));

  return {
    totalPartners: Number(partnerStats?.total || 0),
    activePartners: Number(partnerStats?.active || 0),
    totalClicks,
    totalConversions,
    totalEarningsCents: totalEarnings,
    conversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
    totalReferrals: Number(refStats?.totalReferrals || 0),
    totalReferralRewards: Number(refStats?.totalRewards || 0),
    estimatedMonthlyRevenueCents: Number(recentEarnings?.earnings || 0),
  };
}

// ─── AI-Powered Outreach (Zero Cost Partner Acquisition) ────────────

/**
 * Generate AI-powered partnership outreach email
 */
export async function generateOutreachEmail(
  partnerId: number
): Promise<{ subject: string; body: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [partner] = await db.select().from(affiliatePartners)
    .where(eq(affiliatePartners.id, partnerId))
    .limit(1);

  if (!partner) throw new Error("Partner not found");

  try {
    const response = await invokeLLM({
      systemTag: "affiliate",
      model: "fast",
      messages: [
        {
          role: "system",
          content: `You are a business development expert for Archibald Titan — the world's most advanced local AI agent platform. 
Titan enables users to build apps, automate workflows, manage marketing, and more — all through natural language.
Write compelling partnership outreach emails. Return ONLY valid JSON with "subject" and "body" fields.`,
        },
        {
          role: "user",
          content: `Generate a partnership outreach email for:
Company: ${partner.name}
Domain: ${partner.domain}
Vertical: ${partner.vertical}
Commission: ${partner.commissionType} at ${partner.commissionRate}${partner.commissionType === "revshare" ? "%" : " cents"}

Propose cross-promotion and affiliate partnership. Be specific about mutual value.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "outreach_email",
          strict: true,
          schema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              body: { type: "string" },
            },
            required: ["subject", "body"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") throw new Error("No LLM response");

    const email = JSON.parse(content);

    await db.insert(affiliateOutreach).values({
      partnerId,
      type: "email",
      subject: email.subject,
      body: email.body,
      status: "drafted",
      aiGenerated: true,
    });

    return email;
  } catch (error) {
    log.error("[AffiliateEngine] Failed to generate outreach:", { error: String(error) });
    const fallback = {
      subject: `Partnership Opportunity: Archibald Titan x ${partner.name}`,
      body: `Dear ${partner.name} Team,\n\nI'm reaching out to propose a mutually beneficial partnership between Archibald Titan and ${partner.name}.\n\nArchibald Titan is the world's most advanced local AI agent platform. Our users actively need tools like ${partner.name}.\n\nWe'd love to explore cross-promotion and affiliate partnership opportunities.\n\nBest regards,\nArchibald Titan Partnership Team`,
    };

    await db.insert(affiliateOutreach).values({
      partnerId,
      type: "email",
      subject: fallback.subject,
      body: fallback.body,
      status: "drafted",
      aiGenerated: true,
    });

    return fallback;
  }
}

// ─── Performance Optimization ───────────────────────────────────────

/**
 * Calculate performance score for a partner (0-100)
 * Higher score = more profitable = more visibility
 */
export function calculatePerformanceScore(partner: {
  totalClicks: number;
  totalConversions: number;
  totalEarnings: number;
}): number {
  const conversionRate = partner.totalClicks > 0
    ? (partner.totalConversions / partner.totalClicks) * 100
    : 0;

  const clickScore = Math.min(partner.totalClicks / 100, 1) * 20;
  const conversionScore = Math.min(conversionRate / 5, 1) * 40;
  const earningsScore = Math.min(partner.totalEarnings / 100000, 1) * 40;

  return Math.round(clickScore + conversionScore + earningsScore);
}

/**
 * AI-powered partner performance analysis
 */
export async function analyzePartnerPerformance(partnerId: number): Promise<{
  performanceScore: number;
  recommendations: string[];
  shouldContinue: boolean;
  suggestedTier: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [partner] = await db.select().from(affiliatePartners)
    .where(eq(affiliatePartners.id, partnerId))
    .limit(1);

  if (!partner) throw new Error("Partner not found");

  const score = calculatePerformanceScore(partner);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentClicks = await db.select().from(affiliateClicks)
    .where(and(
      eq(affiliateClicks.partnerId, partnerId),
      gte(affiliateClicks.createdAt, thirtyDaysAgo)
    ));

  const recentConversions = recentClicks.filter((c: { converted: boolean }) => c.converted);

  try {
    const response = await invokeLLM({
      systemTag: "affiliate",
      model: "fast",
      messages: [
        { role: "system", content: "You are an affiliate marketing analyst. Return only valid JSON." },
        {
          role: "user",
          content: `Analyze: ${partner.name} (${partner.vertical})
Commission: ${partner.commissionType} at ${partner.commissionRate}
All-time: ${partner.totalClicks} clicks, ${partner.totalConversions} conversions, $${(partner.totalEarnings / 100).toFixed(2)}
Last 30d: ${recentClicks.length} clicks, ${recentConversions.length} conversions
Score: ${score}/100, Tier: ${partner.tier}
Provide: recommendations, shouldContinue, suggestedTier (bronze/silver/gold/platinum)`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "partner_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              recommendations: { type: "array", items: { type: "string" } },
              shouldContinue: { type: "boolean" },
              suggestedTier: { type: "string" },
            },
            required: ["recommendations", "shouldContinue", "suggestedTier"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") throw new Error("No LLM response");

    const analysis = JSON.parse(content);
    return { performanceScore: score, ...analysis };
  } catch {
    return {
      performanceScore: score,
      recommendations: ["Monitor conversion rates", "Test different placements", "Optimize landing pages"],
      shouldContinue: score >= 30,
      suggestedTier: score >= 70 ? "gold" : score >= 40 ? "silver" : "bronze",
    };
  }
}

// ─── Autonomous Optimization Cycle (Daily Cron) ─────────────────────

/**
 * Run the full autonomous optimization cycle
 * Maximizes revenue with zero human intervention
 */
export async function runAffiliateOptimizationCycle(): Promise<{
  partnersAnalyzed: number;
  partnersPaused: number;
  partnersPromoted: number;
  outreachGenerated: number;
}> {
  log.info("[AffiliateEngine] Starting autonomous optimization cycle...");

  const db = await getDb();
  if (!db) return { partnersAnalyzed: 0, partnersPaused: 0, partnersPromoted: 0, outreachGenerated: 0 };

  let partnersAnalyzed = 0;
  let partnersPaused = 0;
  let partnersPromoted = 0;
  let outreachGenerated = 0;

  // 1. Analyze all active partners
  const activePartners = await db.select().from(affiliatePartners)
    .where(eq(affiliatePartners.status, "active"));

  for (const partner of activePartners) {
    try {
      const analysis = await analyzePartnerPerformance(partner.id);
      partnersAnalyzed++;

      await db.update(affiliatePartners)
        .set({
          performanceScore: analysis.performanceScore,
          lastOptimizedAt: new Date(),
        })
        .where(eq(affiliatePartners.id, partner.id));

      // Auto-pause underperformers (save wasted visibility)
      if (analysis.performanceScore < 20 && !analysis.shouldContinue) {
        await db.update(affiliatePartners)
          .set({ status: "paused" })
          .where(eq(affiliatePartners.id, partner.id));
        partnersPaused++;
      }

      // Auto-promote high performers (give them more visibility)
      const validTiers = ["bronze", "silver", "gold", "platinum"] as const;
      if (validTiers.includes(analysis.suggestedTier as any) && analysis.suggestedTier !== partner.tier && analysis.performanceScore > 60) {
        await db.update(affiliatePartners)
          .set({ tier: analysis.suggestedTier as typeof validTiers[number] })
          .where(eq(affiliatePartners.id, partner.id));
        partnersPromoted++;
      }
    } catch (error) {
      log.error(`[AffiliateEngine] Failed to analyze partner ${partner.id}:`, { error: String(error) });
    }
  }

  // 2. Auto-outreach to prospects (free partner acquisition)
  const prospects = await db.select().from(affiliatePartners)
    .where(and(
      eq(affiliatePartners.status, "prospect"),
      sql`${affiliatePartners.applicationSentAt} IS NULL`
    ))
    .limit(5);

  for (const prospect of prospects) {
    try {
      await generateOutreachEmail(prospect.id);
      outreachGenerated++;
    } catch (error) {
      log.error(`[AffiliateEngine] Failed to generate outreach for ${prospect.id}:`, { error: String(error) });
    }
  }

  log.info(`[AffiliateEngine] Optimization complete: ${partnersAnalyzed} analyzed, ${partnersPaused} paused, ${partnersPromoted} promoted, ${outreachGenerated} outreach`);
  return { partnersAnalyzed, partnersPaused, partnersPromoted, outreachGenerated };
}

// ─── Referral Leaderboard ───────────────────────────────────────────

export async function getReferralLeaderboard(limit = 10): Promise<Array<{
  userId: number;
  userName: string | null;
  code: string;
  totalReferrals: number;
  totalRewards: number;
  tier: string;
}>> {
  const db = await getDb();
  if (!db) return [];

  const codes = await db.select({
    userId: referralCodes.userId,
    code: referralCodes.code,
    totalReferrals: referralCodes.totalReferrals,
    totalRewards: referralCodes.totalRewardsEarned,
    userName: users.name,
  })
    .from(referralCodes)
    .leftJoin(users, eq(referralCodes.userId, users.id))
    .where(eq(referralCodes.isActive, true))
    .orderBy(desc(referralCodes.totalReferrals))
    .limit(limit);

  return codes.map((c: { userId: number; userName: string | null; code: string; totalReferrals: number; totalRewards: number }) => {
    const tier = REFERRAL_CONFIG.tiers
      .filter(t => c.totalReferrals >= t.minReferrals)
      .pop()?.name || "Starter";
    return {
      userId: c.userId,
      userName: c.userName,
      code: c.code,
      totalReferrals: c.totalReferrals,
      totalRewards: c.totalRewards,
      tier,
    };
  });
}

// ─── Partner CRUD ───────────────────────────────────────────────────

export async function getPartners(filters?: {
  status?: string;
  vertical?: string;
}): Promise<typeof affiliatePartners.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];

  const allPartners = await db.select().from(affiliatePartners)
    .orderBy(desc(affiliatePartners.performanceScore));

  if (filters?.status) {
    return allPartners.filter((p: { status: string }) => p.status === filters.status);
  }
  if (filters?.vertical) {
    return allPartners.filter((p: { vertical: string }) => p.vertical === filters.vertical);
  }

  return allPartners;
}

export async function createPartner(data: InsertAffiliatePartner): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(affiliatePartners).values(data);
  return Number(result[0].insertId);
}

export async function updatePartner(id: number, data: Partial<InsertAffiliatePartner>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(affiliatePartners).set(data).where(eq(affiliatePartners.id, id));
}

// ─── User Referral Info ─────────────────────────────────────────────

export async function getUserReferralInfo(userId: number): Promise<{
  code: string;
  totalReferrals: number;
  totalRewards: number;
  tier: string;
  nextRewardAt?: number;
  discountEarned: boolean;
  discountPercent: number;
  referralsNeeded: number;
  remaining: number;
  referralLink: string;
}> {
  const code = await generateReferralCode(userId);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [codeRecord] = await db.select().from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1);

  const totalReferrals = codeRecord?.totalReferrals || 0;
  const totalRewards = codeRecord?.totalRewardsEarned || 0;

  const tier = REFERRAL_CONFIG.tiers
    .filter(t => totalReferrals >= t.minReferrals)
    .pop()?.name || "Starter";

  const discountEarned = totalRewards > 0;
  const remaining = Math.max(0, REFERRAL_CONFIG.referralsForDiscount - totalReferrals);
  return {
    code,
    totalReferrals,
    totalRewards,
    tier,
    discountEarned,
    discountPercent: REFERRAL_CONFIG.discountPercent,
    referralsNeeded: REFERRAL_CONFIG.referralsForDiscount,
    remaining,
    referralLink: `https://www.archibaldtitan.com/signup?ref=${code}`,
  };
}

/**
 * Get outreach history for a partner
 */
export async function getPartnerOutreach(partnerId: number): Promise<typeof affiliateOutreach.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(affiliateOutreach)
    .where(eq(affiliateOutreach.partnerId, partnerId))
    .orderBy(desc(affiliateOutreach.createdAt));
}

/**
 * Get payout history
 */
export async function getPayoutHistory(limit = 20): Promise<typeof affiliatePayouts.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(affiliatePayouts)
    .orderBy(desc(affiliatePayouts.createdAt))
    .limit(limit);
}


// ═══════════════════════════════════════════════════════════════════════
// ─── ENHANCED REFERRAL AFFILIATE PROGRAM ─────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
// 10% base recurring commission for 12 months, tiered up to 22% for
// Titan Elite affiliates. Payout via wire transfer or 1.5x credits.

/**
 * Get the current tier for a given referral count
 */
export function getReferralTier(totalReferrals: number) {
  return REFERRAL_CONFIG.tiers
    .filter(t => totalReferrals >= t.minReferrals)
    .pop() || REFERRAL_CONFIG.tiers[0];
}

/**
 * Get the next tier (for progress display)
 */
export function getNextReferralTier(totalReferrals: number) {
  const currentTier = getReferralTier(totalReferrals);
  const currentIndex = REFERRAL_CONFIG.tiers.findIndex(t => t.name === currentTier.name);
  if (currentIndex < REFERRAL_CONFIG.tiers.length - 1) {
    return REFERRAL_CONFIG.tiers[currentIndex + 1];
  }
  return null; // Already at max tier
}

/**
 * Get detailed referral dashboard data for a user
 * Includes earnings breakdown, conversion history, tier progress, and payout info
 */
export async function getUserReferralDashboard(userId: number): Promise<{
  code: string;
  referralLink: string;
  totalReferrals: number;
  activeReferrals: number;
  totalEarningsCents: number;
  pendingPayoutCents: number;
  paidOutCents: number;
  currentTier: { name: string; commissionPercent: number; badge: string; perks: string };
  nextTier: { name: string; minReferrals: number; commissionPercent: number; badge: string; perks: string } | null;
  tierProgress: number;
  referralsToNextTier: number;
  monthlyRecurringCents: number;
  conversions: Array<{
    id: number;
    status: string;
    rewardType: string | null;
    rewardAmountCents: number;
    createdAt: Date;
    subscriptionId: string | null;
  }>;
  payouts: Array<{
    id: number;
    amountCents: number;
    status: string;
    paymentMethod: string | null;
    createdAt: Date;
    processedAt: Date | null;
  }>;
  commissionDurationMonths: number;
  payoutOptions: readonly string[];
  creditBonusMultiplier: number;
  minPayoutCents: number;
  allTiers: typeof REFERRAL_CONFIG.tiers;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get or create referral code
  const code = await generateReferralCode(userId);

  // Get code record
  const [codeRecord] = await db.select().from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1);

  const totalReferrals = codeRecord?.totalReferrals || 0;
  const totalCommissionCents = codeRecord?.totalCommissionCents || 0;

  // Get conversions for this user
  const conversions = codeRecord
    ? await db.select({
        id: referralConversions.id,
        status: referralConversions.status,
        rewardType: referralConversions.rewardType,
        rewardAmountCents: referralConversions.rewardAmountCents,
        createdAt: referralConversions.createdAt,
        subscriptionId: referralConversions.subscriptionId,
      })
      .from(referralConversions)
      .where(eq(referralConversions.referrerId, userId))
      .orderBy(desc(referralConversions.createdAt))
      .limit(50)
    : [];

  // Count active (subscribed) referrals
  const activeReferrals = conversions.filter(c => c.status === "subscribed" || c.status === "rewarded").length;

  // Calculate monthly recurring commission estimate
  // Based on active subscribers * average plan price * commission %
  const currentTier = getReferralTier(totalReferrals);
  const avgPlanCents = 2900; // $29/mo average
  const monthlyRecurringCents = Math.round(activeReferrals * avgPlanCents * (currentTier.commissionPercent / 100));

  // Get payout history for this user
  const payouts = codeRecord
    ? await db.select({
        id: affiliatePayouts.id,
        amountCents: affiliatePayouts.amountCents,
        status: affiliatePayouts.status,
        paymentMethod: affiliatePayouts.paymentMethod,
        createdAt: affiliatePayouts.createdAt,
        processedAt: affiliatePayouts.processedAt,
      })
      .from(affiliatePayouts)
      .where(eq(affiliatePayouts.partnerId, codeRecord.id)) // partnerId stores referral code ID for user payouts
      .orderBy(desc(affiliatePayouts.createdAt))
      .limit(20)
    : [];

  // Calculate paid out amount
  const paidOutCents = payouts
    .filter(p => p.status === "completed")
    .reduce((sum, p) => sum + p.amountCents, 0);

  // Pending = total earned - paid out
  const pendingPayoutCents = Math.max(0, totalCommissionCents - paidOutCents);

  // Tier progress
  const nextTier = getNextReferralTier(totalReferrals);
  let tierProgress = 100;
  let referralsToNextTier = 0;
  if (nextTier) {
    const prevMin = currentTier.minReferrals;
    const nextMin = nextTier.minReferrals;
    tierProgress = Math.round(((totalReferrals - prevMin) / (nextMin - prevMin)) * 100);
    referralsToNextTier = nextMin - totalReferrals;
  }

  return {
    code,
    referralLink: `https://www.archibaldtitan.com/signup?ref=${code}`,
    totalReferrals,
    activeReferrals,
    totalEarningsCents: totalCommissionCents,
    pendingPayoutCents,
    paidOutCents,
    currentTier,
    nextTier: nextTier ? { ...nextTier } : null,
    tierProgress,
    referralsToNextTier,
    monthlyRecurringCents,
    conversions,
    payouts,
    commissionDurationMonths: REFERRAL_CONFIG.commissionDurationMonths,
    payoutOptions: REFERRAL_CONFIG.payoutOptions,
    creditBonusMultiplier: REFERRAL_CONFIG.creditBonusMultiplier,
    minPayoutCents: REFERRAL_CONFIG.minPayoutCents,
    allTiers: REFERRAL_CONFIG.tiers,
  };
}

/**
 * Request a payout for accumulated referral commissions
 */
export async function requestReferralPayout(
  userId: number,
  method: "wire_transfer" | "credits"
): Promise<{ success: boolean; message: string; payoutId?: number; amountCents?: number }> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database not available" };

  const [codeRecord] = await db.select().from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1);

  if (!codeRecord) {
    return { success: false, message: "No referral code found" };
  }

  // Calculate pending amount
  const completedPayouts = await db.select({
    total: sql<number>`COALESCE(SUM(${affiliatePayouts.amountCents}), 0)`,
  })
    .from(affiliatePayouts)
    .where(and(
      eq(affiliatePayouts.partnerId, codeRecord.id),
      eq(affiliatePayouts.status, "completed"),
    ));

  const paidOut = completedPayouts[0]?.total || 0;
  const pendingAmount = codeRecord.totalCommissionCents - paidOut;

  if (pendingAmount < REFERRAL_CONFIG.minPayoutCents) {
    return {
      success: false,
      message: `Minimum payout is $${(REFERRAL_CONFIG.minPayoutCents / 100).toFixed(2)}. You have $${(pendingAmount / 100).toFixed(2)} pending.`,
    };
  }

  // Apply credit bonus if paying in credits
  let finalAmount = pendingAmount;
  if (method === "credits") {
    finalAmount = Math.round(pendingAmount * REFERRAL_CONFIG.creditBonusMultiplier);
  }

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const result = await db.insert(affiliatePayouts).values({
    partnerId: codeRecord.id,
    amountCents: finalAmount,
    currency: method === "credits" ? "CRD" : "USD",
    status: "pending",
    paymentMethod: method,
    periodStart,
    periodEnd,
    conversionCount: codeRecord.totalReferrals,
  });

  const payoutId = Number(result[0].insertId);

  return {
    success: true,
    message: method === "credits"
      ? `Payout of ${finalAmount} credits requested (${REFERRAL_CONFIG.creditBonusMultiplier}x bonus applied!)`
      : `Payout of $${(finalAmount / 100).toFixed(2)} via wire transfer requested. Processing in 3-5 business days.`,
    payoutId,
    amountCents: finalAmount,
  };
}

/**
 * Record a recurring commission when a referred user makes a payment
 * Called from Stripe webhook or payment processing
 */
export async function recordReferralCommission(
  referredUserId: number,
  paymentAmountCents: number,
  subscriptionId?: string
): Promise<{ success: boolean; commissionCents: number; referrerId?: number }> {
  const db = await getDb();
  if (!db) return { success: false, commissionCents: 0 };

  // Find the conversion record for this referred user
  const [conversion] = await db.select().from(referralConversions)
    .where(eq(referralConversions.referredUserId, referredUserId))
    .limit(1);

  if (!conversion) {
    return { success: false, commissionCents: 0 };
  }

  // Check if still within commission duration
  const monthsSinceReferral = Math.floor(
    (Date.now() - new Date(conversion.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000)
  );

  if (monthsSinceReferral > REFERRAL_CONFIG.commissionDurationMonths) {
    return { success: false, commissionCents: 0 };
  }

  // Get referrer's current tier
  const [codeRecord] = await db.select().from(referralCodes)
    .where(eq(referralCodes.userId, conversion.referrerId))
    .limit(1);

  if (!codeRecord) {
    return { success: false, commissionCents: 0 };
  }

  const tier = getReferralTier(codeRecord.totalReferrals);
  const commissionCents = Math.round(paymentAmountCents * (tier.commissionPercent / 100));

  // Update conversion record
  await db.update(referralConversions)
    .set({
      status: "rewarded",
      rewardType: "commission",
      rewardAmountCents: sql`${referralConversions.rewardAmountCents} + ${commissionCents}`,
      subscriptionId: subscriptionId || conversion.subscriptionId,
      rewardGrantedAt: new Date(),
    })
    .where(eq(referralConversions.id, conversion.id));

  // Update total commission on code record
  await db.update(referralCodes)
    .set({
      totalCommissionCents: sql`${referralCodes.totalCommissionCents} + ${commissionCents}`,
    })
    .where(eq(referralCodes.id, codeRecord.id));

  log.info(`[ReferralProgram] Commission: $${(commissionCents / 100).toFixed(2)} (${tier.commissionPercent}%) for user ${conversion.referrerId} from payment by user ${referredUserId}`);

  return { success: true, commissionCents, referrerId: conversion.referrerId };
}
