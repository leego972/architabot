import Stripe from "stripe";
import { z } from "zod";
import { eq, and, isNotNull, ne, sql } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { subscriptions, users, creditBalances } from "../drizzle/schema";
import { PRICING_TIERS, CREDIT_PACKS, type PlanId } from "../shared/pricing";
import { addCredits, processMonthlyRefill, getCreditBalance } from "./credit-service";
import { referralCodes } from "../drizzle/schema";
import { REFERRAL_CONFIG } from "./affiliate-engine";
import { sellerProfiles } from "../drizzle/schema";
import type { Express, Request, Response } from "express";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
const log = createLogger("StripeRouter");

/** In-memory set of processed Stripe webhook event IDs for idempotency */
const processedWebhookEvents = new Set<string>();

// ─── Stripe Client ───────────────────────────────────────────────────

let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!ENV.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    stripeInstance = new Stripe(ENV.stripeSecretKey, {
      apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion,
    });
  }
  return stripeInstance;
}

// ─── Price Cache ────────────────────────────────────────────────────
// We create Stripe products/prices on-demand and cache the IDs

const priceCache: Record<string, string> = {};

type PaidPlanId = "pro" | "enterprise" | "cyber" | "cyber_plus" | "titan";

async function getOrCreatePrice(
  planId: PaidPlanId,
  interval: "month" | "year"
): Promise<string> {
  const cacheKey = `${planId}_${interval}`;
  if (priceCache[cacheKey]) return priceCache[cacheKey];

  const stripe = getStripe();
  const tier = PRICING_TIERS.find((t) => t.id === planId);
  if (!tier) throw new Error(`Unknown plan: ${planId}`);

  const amount =
    interval === "month" ? tier.monthlyPrice * 100 : tier.yearlyPrice * 100;

  // Search for existing product
  const products = await stripe.products.list({ limit: 100 });
  let product = products.data.find(
    (p) => p.metadata.plan_id === planId && p.active
  );

  if (!product) {
    product = await stripe.products.create({
      name: `Archibald Titan ${tier.name}`,
      description: tier.tagline,
      metadata: { plan_id: planId },
    });
  }

  // Search for existing price
  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });
  let price = prices.data.find(
    (p) =>
      p.recurring?.interval === interval && p.unit_amount === amount
  );

  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: amount,
      currency: "usd",
      recurring: { interval },
      metadata: { plan_id: planId, interval },
    });
  }

  priceCache[cacheKey] = price.id;
  return price.id;
}

// ─── Helper: Get or create Stripe customer ──────────────────────────

async function getOrCreateCustomer(
  userId: number,
  email: string,
  name?: string | null
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if user already has a subscription record with a customer ID
  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (existing.length > 0 && existing[0].stripeCustomerId) {
    return existing[0].stripeCustomerId;
  }

  // Create new Stripe customer
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: { user_id: userId.toString() },
  });

  return customer.id;
}

// ─── Helper: Look up userId from Stripe customer ID ─────────────────

async function getUserIdFromCustomerId(customerId: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const sub = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);

  return sub.length > 0 ? sub[0].userId : null;
}

// ─── tRPC Router ────────────────────────────────────────────────────

export const stripeRouter = router({
  // Get current user's credit balance
  getCreditBalance: protectedProcedure.query(async ({ ctx }) => {
    const balance = await getCreditBalance(ctx.user.id);
    return balance;
  }),

  // Get available credit packs for purchase
  getCreditPacks: publicProcedure.query(() => {
    return CREDIT_PACKS;
  }),

  // Get all pricing tiers
  getPricingTiers: publicProcedure.query(() => {
    return PRICING_TIERS;
  }),

  // Get current user's subscription status
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { plan: "free" as PlanId, status: "active" };

    const sub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1);

    if (sub.length === 0) {
      return { plan: "free" as PlanId, status: "active" };
    }

    return {
      plan: sub[0].plan as PlanId,
      status: sub[0].status,
      stripeSubscriptionId: sub[0].stripeSubscriptionId,
      currentPeriodEnd: sub[0].currentPeriodEnd,
    };
  }),

  // Create a Stripe Checkout session for subscription
  createCheckout: protectedProcedure
    .input(
      z.object({
        planId: z.enum(["pro", "enterprise", "cyber", "cyber_plus", "titan"]),
        interval: z.enum(["month", "year"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      const priceId = await getOrCreatePrice(input.planId as PaidPlanId, input.interval);
      const customerId = await getOrCreateCustomer(
        ctx.user.id,
        ctx.user.email || "",
        ctx.user.name
      );

      const origin = ctx.req.headers.origin || process.env.APP_URL || "https://www.archibaldtitan.com";

      // ─── Check if user has earned the referral discount ───
      // 5 verified sign-ups = 30% off first month (one-time)
      let discounts: Array<{ coupon: string }> = [];
      try {
        const db = await getDb();
        if (db) {
          const [userCode] = await db.select().from(referralCodes)
            .where(eq(referralCodes.userId, ctx.user.id))
            .limit(1);
          if (
            userCode &&
            userCode.totalReferrals >= REFERRAL_CONFIG.referralsForDiscount &&
            userCode.totalRewardsEarned > 0
          ) {
            // Check if they haven't already used the discount
            const existingSubs = await db.select().from(subscriptions)
              .where(eq(subscriptions.userId, ctx.user.id))
              .limit(1);
            const isFirstSubscription = existingSubs.length === 0;
            if (isFirstSubscription) {
              // Create or retrieve the Stripe coupon for referral discount
              const couponId = `REFERRAL_${REFERRAL_CONFIG.discountPercent}PCT_OFF`;
              try {
                await stripe.coupons.retrieve(couponId);
              } catch {
                await stripe.coupons.create({
                  id: couponId,
                  percent_off: REFERRAL_CONFIG.discountPercent,
                  duration: "once",
                  name: `Referral Reward: ${REFERRAL_CONFIG.discountPercent}% off first month`,
                });
              }
              discounts = [{ coupon: couponId }];
              log.info(`[Stripe] Applying ${REFERRAL_CONFIG.discountPercent}% referral discount for user ${ctx.user.id}`);
            }
          }

          // ─── Deal 2: High-Value Referral ───
          // If user earned 50% off Pro annual (referred someone who subscribed to Cyber+)
          if (
            discounts.length === 0 &&
            input.planId === "pro" &&
            input.interval === "year"
          ) {
            const hvrCouponId = `HVR_50PCT_PRO_ANNUAL_USER_${ctx.user.id}`;
            try {
              const hvrCoupon = await stripe.coupons.retrieve(hvrCouponId);
              if (hvrCoupon && hvrCoupon.valid) {
                discounts = [{ coupon: hvrCouponId }];
                log.info(`[Stripe] Applying 50% high-value referral discount for user ${ctx.user.id} on Pro annual`);
              }
            } catch {
              // No high-value referral coupon exists for this user — that's fine
            }
          }
        }
      } catch (e) {
        log.warn(`[Stripe] Could not check referral discount: ${getErrorMessage(e)}`);
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        client_reference_id: ctx.user.id.toString(),
        customer_email: undefined, // Already set on customer object
        mode: "subscription",
        allow_promotion_codes: discounts.length === 0, // Don't allow promo codes if referral discount already applied
        ...(discounts.length > 0 ? { discounts } : {}),
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/pricing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pricing?canceled=true`,
        metadata: {
          user_id: ctx.user.id.toString(),
          plan_id: input.planId,
          interval: input.interval,
          referral_discount: discounts.length > 0 ? "true" : "false",
        },
        subscription_data: {
          metadata: {
            user_id: ctx.user.id.toString(),
            plan_id: input.planId,
          },
        },
      });

      return { url: session.url, referralDiscountApplied: discounts.length > 0 };
    }),

  // Purchase a credit top-up pack (one-time payment)
  purchaseCreditPack: protectedProcedure
    .input(
      z.object({
        packId: z.enum(["pack_500", "pack_2500", "pack_5000", "pack_10000"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      const pack = CREDIT_PACKS.find((p) => p.id === input.packId);
      if (!pack) throw new Error(`Unknown credit pack: ${input.packId}`);

      const customerId = await getOrCreateCustomer(
        ctx.user.id,
        ctx.user.email || "",
        ctx.user.name
      );

      const origin = ctx.req.headers.origin || process.env.APP_URL || "https://www.archibaldtitan.com";

      // Create a one-time payment checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        client_reference_id: ctx.user.id.toString(),
        mode: "payment",
        allow_promotion_codes: true,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.round(pack.price * 100),
              product_data: {
                name: `${pack.name} — ${pack.credits.toLocaleString()} Credits`,
                description: `One-time purchase of ${pack.credits.toLocaleString()} credits for Archibald Titan`,
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}/pricing?pack_success=true&pack=${input.packId}`,
        cancel_url: `${origin}/pricing?canceled=true`,
        metadata: {
          type: "credit_pack",
          user_id: ctx.user.id.toString(),
          pack_id: input.packId,
          credits: pack.credits.toString(),
        },
      });

      return { url: session.url };
    }),

  // Change subscription plan (upgrade or downgrade)
  changePlan: protectedProcedure
    .input(
      z.object({
        planId: z.enum(["pro", "enterprise", "cyber", "cyber_plus", "titan"]),
        interval: z.enum(["month", "year"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const sub = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, ctx.user.id))
        .limit(1);

      if (sub.length === 0 || !sub[0].stripeSubscriptionId) {
        throw new Error("No active subscription found. Please subscribe first.");
      }

      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(sub[0].stripeSubscriptionId);

      if (subscription.status !== "active" && subscription.status !== "trialing") {
        throw new Error("Subscription is not active. Cannot change plan.");
      }

      const newPriceId = await getOrCreatePrice(input.planId as PaidPlanId, input.interval);
      const currentItem = subscription.items.data[0];

      // Update subscription with proration_behavior = "always_invoice"
      // This charges the user immediately for downgrades (as requested)
      await stripe.subscriptions.update(sub[0].stripeSubscriptionId, {
        items: [
          {
            id: currentItem.id,
            price: newPriceId,
          },
        ],
        proration_behavior: "always_invoice",
        metadata: {
          user_id: ctx.user.id.toString(),
          plan_id: input.planId,
        },
      });

      // Update local subscription record immediately
      await db
        .update(subscriptions)
        .set({ plan: input.planId })
        .where(eq(subscriptions.userId, ctx.user.id));

      // Grant credit difference on upgrade (so users get extra credits immediately)
      const oldTier = PRICING_TIERS.find((t) => t.id === sub[0].plan);
      const newTier = PRICING_TIERS.find((t) => t.id === input.planId);
      if (oldTier && newTier && newTier.credits.monthlyAllocation > oldTier.credits.monthlyAllocation) {
        const creditDiff = newTier.credits.monthlyAllocation - oldTier.credits.monthlyAllocation;
        await addCredits(
          ctx.user.id,
          creditDiff,
          "admin_adjustment",
          `Plan upgrade (${oldTier.name} → ${newTier.name}): +${creditDiff} bonus credits`
        );
        log.info(`[Stripe] Upgrade credit bonus: user=${ctx.user.id}, ${oldTier.name} → ${newTier.name}, +${creditDiff} credits`);
      }

      return { success: true, newPlan: input.planId };
    }),

  // Cancel subscription (keeps remaining credits, stops auto-renewal)
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const sub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1);

    if (sub.length === 0 || !sub[0].stripeSubscriptionId) {
      throw new Error("No active subscription found");
    }

    const stripe = getStripe();

    // Cancel at period end — user keeps access until billing period ends
    // Their remaining credits are preserved (never zeroed out)
    await stripe.subscriptions.update(sub[0].stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    log.info(`[Stripe] Subscription ${sub[0].stripeSubscriptionId} set to cancel at period end for user ${ctx.user.id}`);

    return { success: true, message: "Subscription will cancel at the end of your billing period. Your remaining credits are preserved." };
  }),

  // Resume a cancelled subscription (undo cancel_at_period_end)
  resumeSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const sub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1);

    if (sub.length === 0 || !sub[0].stripeSubscriptionId) {
      throw new Error("No subscription found");
    }

    const stripe = getStripe();

    await stripe.subscriptions.update(sub[0].stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    return { success: true, message: "Subscription resumed. Auto-renewal is back on." };
  }),

  // ─── Bazaar Seller Subscription ($12/year) ─────────────────────────
  purchaseSellerSubscription: protectedProcedure
    .input(z.object({
      displayName: z.string().min(2).max(128),
      bio: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      const customerId = await getOrCreateCustomer(
        ctx.user.id,
        ctx.user.email || "",
        ctx.user.name
      );
      const origin = ctx.req.headers.origin || process.env.APP_URL || "https://www.archibaldtitan.com";

      // Search for existing Bazaar Seller product or create one
      const products = await stripe.products.list({ limit: 100 });
      let product = products.data.find(
        (p) => p.metadata.type === "bazaar_seller" && p.active
      );
      if (!product) {
        product = await stripe.products.create({
          name: "Archibald Titan — Bazaar Seller Subscription",
          description: "Annual seller registration for the Titan Bazaar marketplace. List and sell code, AI agents, modules, and more.",
          metadata: { type: "bazaar_seller" },
        });
      }

      // Search for existing $12/year price or create one
      const prices = await stripe.prices.list({ product: product.id, active: true, limit: 20 });
      let price = prices.data.find(
        (p) => p.recurring?.interval === "year" && p.unit_amount === 1200
      );
      if (!price) {
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: 1200, // $12.00
          currency: "usd",
          recurring: { interval: "year" },
          metadata: { type: "bazaar_seller" },
        });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        client_reference_id: ctx.user.id.toString(),
        mode: "subscription",
        allow_promotion_codes: true,
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: `${origin}/marketplace?seller_success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/marketplace?seller_canceled=true`,
        metadata: {
          type: "bazaar_seller",
          user_id: ctx.user.id.toString(),
          display_name: input.displayName,
          bio: (input.bio || "").slice(0, 500),
        },
        subscription_data: {
          metadata: {
            type: "bazaar_seller",
            user_id: ctx.user.id.toString(),
            display_name: input.displayName,
          },
        },
      });

      return { url: session.url };
    }),

  // Cancel seller subscription
  cancelSellerSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const profile = await db
      .select()
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, ctx.user.id))
      .limit(1);

    if (!profile[0] || !profile[0].sellerSubscriptionStripeId) {
      throw new Error("No active seller subscription found");
    }

    const stripe = getStripe();
    await stripe.subscriptions.update(profile[0].sellerSubscriptionStripeId, {
      cancel_at_period_end: true,
    });

    return { success: true, message: "Seller subscription will cancel at the end of your billing period. Your listings remain active until then." };
  }),

  // Create a Stripe Customer Portal session (manage subscription)
  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const sub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1);

    if (sub.length === 0 || !sub[0].stripeCustomerId) {
      throw new Error("No active subscription found");
    }

    const stripe = getStripe();
    const origin = ctx.req.headers.origin || process.env.APP_URL || "https://www.archibaldtitan.com";

    const session = await stripe.billingPortal.sessions.create({
      customer: sub[0].stripeCustomerId,
      return_url: `${origin}/pricing`,
    });

    return { url: session.url };
  }),

  // ─── Trial System: Setup Intent for payment collection ─────────
  createTrialSetup: protectedProcedure.mutation(async ({ ctx }) => {
    const stripe = getStripe();
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get or create Stripe customer
    const customerId = await getOrCreateCustomer(
      ctx.user.id,
      ctx.user.email || "",
      ctx.user.name
    );

    // Save stripeCustomerId to user record
    await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, ctx.user.id));

    const origin = ctx.req.headers.origin || process.env.APP_URL || "https://www.archibaldtitan.com";

    // Create a checkout session in setup mode to collect payment method
    // Then we'll create the trial subscription in the webhook
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: ctx.user.id.toString(),
      mode: "subscription",
      allow_promotion_codes: true,
      line_items: [{
        price: await (async () => {
          const priceId = await getOrCreatePrice("pro", "month");
          return priceId;
        })(),
        quantity: 1,
      }],
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          user_id: ctx.user.id.toString(),
          plan_id: "pro",
          is_trial: "true",
        },
      },
      success_url: `${origin}/dashboard?trial_started=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/payment-setup?skipped=true`,
      metadata: {
        user_id: ctx.user.id.toString(),
        plan_id: "pro",
        is_trial: "true",
      },
    });

    return { url: session.url };
  }),

  // Get trial status for current user
  getTrialStatus: protectedProcedure.query(async ({ ctx }) => {
    const DEFAULT_STATUS = { inTrial: false, hasPaymentMethod: false, trialEndsAt: null, trialStartedAt: null, daysRemaining: 0, trialExpired: false, trialConverted: false };
    try {
      const db = await getDb();
      if (!db) return DEFAULT_STATUS;

      const user = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      if (!user[0]) return DEFAULT_STATUS;

      const u = user[0] as any; // handle missing columns gracefully
      const now = new Date();
      const trialEndsAt = u.trialEndsAt ?? null;
      const inTrial = !!(trialEndsAt && new Date(trialEndsAt) > now);
      const trialExpired = !!(trialEndsAt && new Date(trialEndsAt) <= now && !u.trialConvertedAt);
      const daysRemaining = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;

      return {
        inTrial,
        hasPaymentMethod: u.hasPaymentMethod ?? false,
        trialEndsAt: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
        trialStartedAt: u.trialStartedAt ? new Date(u.trialStartedAt).toISOString() : null,
        daysRemaining,
        trialExpired,
        trialConverted: !!u.trialConvertedAt,
      };
    } catch (err) {
      // If columns don't exist yet (pre-migration), return safe defaults
      log.warn('[getTrialStatus] Error (likely missing columns):', { error: (err as Error).message });
      return DEFAULT_STATUS;
    }
  }),

  // Skip trial — user chose not to add payment method
  skipTrial: protectedProcedure.mutation(async ({ ctx }) => {
    // No-op — user stays on limited free tier
    return { success: true, message: "You can add a payment method anytime from Settings to unlock your 7-day Pro trial." };
  }),

  // ─── Marketplace Item Purchase via Stripe ────────────────────────
  marketplaceCheckout: protectedProcedure
    .input(z.object({
      listingId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Import marketplace DB functions
      const { getListingById, getPurchaseByBuyerAndListing } = await import("./db");
      const { marketplaceListings } = await import("../drizzle/schema");

      const listing = await getListingById(input.listingId);
      if (!listing) throw new Error("Listing not found");
      if (listing.status !== "active") throw new Error("Listing is not available for purchase");
      if (listing.reviewStatus !== "approved") throw new Error("Listing is pending review");
      if (listing.sellerId === ctx.user.id) throw new Error("Cannot purchase your own listing");

      // Check if already purchased
      const existing = await getPurchaseByBuyerAndListing(ctx.user.id, input.listingId);
      if (existing) throw new Error("You have already purchased this item");

      // Calculate USD price: 1 credit = $0.01, minimum $0.50 for Stripe
      const CREDIT_TO_CENTS = 1; // 1 credit = 1 cent
      let priceInCents = listing.priceUsd > 0 ? listing.priceUsd : listing.priceCredits * CREDIT_TO_CENTS;
      if (priceInCents < 50) priceInCents = 50; // Stripe minimum is $0.50

      const customerId = await getOrCreateCustomer(
        ctx.user.id,
        ctx.user.email || "",
        ctx.user.name
      );

      const origin = ctx.req.headers.origin || process.env.APP_URL || "https://www.archibaldtitan.com";

      // Create one-time payment checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        client_reference_id: ctx.user.id.toString(),
        mode: "payment",
        allow_promotion_codes: true,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: priceInCents,
              product_data: {
                name: listing.title,
                description: `${listing.category.charAt(0).toUpperCase() + listing.category.slice(1)} — ${listing.description.slice(0, 200)}`,
                ...(listing.thumbnailUrl ? { images: [listing.thumbnailUrl] } : {}),
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}/marketplace?purchase_success=true&listing=${listing.uid}`,
        cancel_url: `${origin}/marketplace?purchase_canceled=true`,
        metadata: {
          type: "marketplace_purchase",
          user_id: ctx.user.id.toString(),
          listing_id: input.listingId.toString(),
          listing_uid: listing.uid,
          seller_id: listing.sellerId.toString(),
          price_credits: listing.priceCredits.toString(),
          price_cents: priceInCents.toString(),
        },
      });

      return { url: session.url };
    }),
});

// ─── Webhook Handler (Express route) ────────────────────────────────

export function registerStripeWebhook(app: Express) {
  // MUST register BEFORE express.json() middleware
  app.post(
    "/api/stripe/webhook",
    // Use raw body for signature verification
    (req: Request, res: Response, next) => {
      // Check if body is already parsed (raw buffer)
      if (Buffer.isBuffer(req.body)) {
        return next();
      }
      // Otherwise, collect raw body
      let data = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        (req as any).rawBody = data;
        next();
      });
    },
    async (req: Request, res: Response) => {
      const stripe = getStripe();
      const sig = req.headers["stripe-signature"] as string;
      const webhookSecret = ENV.stripeWebhookSecret;

      let event: Stripe.Event;

      try {
        const body = Buffer.isBuffer(req.body)
          ? req.body
          : (req as any).rawBody || JSON.stringify(req.body);

        event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
      } catch (err: unknown) {
        log.error("[Stripe Webhook] Signature verification failed:", { error: String(getErrorMessage(err)) });
        return res.status(400).json({ error: "Webhook signature verification failed" });
      }

      // Handle test events
      if (event.id.startsWith("evt_test_")) {
        log.info("[Stripe Webhook] Test event detected, returning verification response");
        return res.json({ verified: true });
      }

      // ── Idempotency: skip duplicate events ──
      if (processedWebhookEvents.has(event.id)) {
        log.info(`[Stripe Webhook] Duplicate event skipped: ${event.type} (${event.id})`);
        return res.json({ received: true, duplicate: true });
      }
      processedWebhookEvents.add(event.id);
      // Evict old entries to prevent memory leak (keep last 5000)
      if (processedWebhookEvents.size > 5000) {
        const iter = processedWebhookEvents.values();
        for (let i = 0; i < 1000; i++) iter.next();
        const cutoff = iter.next().value;
        if (cutoff) {
          for (const id of processedWebhookEvents) {
            if (id === cutoff) break;
            processedWebhookEvents.delete(id);
          }
        }
      }

      log.info(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

      try {
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            await handleCheckoutCompleted(session);
            break;
          }
          case "customer.subscription.created": {
            const subscription = event.data.object as Stripe.Subscription;
            await handleSubscriptionCreated(subscription);
            break;
          }
          case "customer.subscription.updated": {
            const subscription = event.data.object as Stripe.Subscription;
            await handleSubscriptionUpdated(subscription);
            break;
          }
          case "customer.subscription.deleted": {
            const subscription = event.data.object as Stripe.Subscription;
            await handleSubscriptionDeleted(subscription);
            break;
          }
          case "invoice.paid": {
            const invoice = event.data.object as Stripe.Invoice;
            await handleInvoicePaid(invoice);
            break;
          }
          case "invoice.payment_failed": {
            const invoice = event.data.object as Stripe.Invoice;
            await handleInvoicePaymentFailed(invoice);
            break;
          }
          default:
            log.info(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }
      } catch (err: unknown) {
        log.error(`[Stripe Webhook] Error processing ${event.type}:`, { error: String(getErrorMessage(err)) });
      }

      res.json({ received: true });
    }
  );

  // ─── Stripe Sync / Reconciliation Endpoint ──────────────────────
  // Reconciles local subscription state with Stripe's actual state.
  // Call this periodically or manually to recover from missed webhooks.
  app.post("/api/stripe/sync", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET || ENV.cookieSecret;

    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });

      const stripe = getStripe();

      // Get all local subscriptions with a Stripe subscription ID
      const localSubs = await db
        .select()
        .from(subscriptions)
        .where(isNotNull(subscriptions.stripeSubscriptionId));

      let synced = 0;
      let errors = 0;
      const changes: string[] = [];

      for (const localSub of localSubs) {
        if (!localSub.stripeSubscriptionId) continue;
        try {
          const stripeSub = await stripe.subscriptions.retrieve(localSub.stripeSubscriptionId);
          const stripeStatus = mapStripeStatus(stripeSub.status);
          const stripePlan = (stripeSub.metadata?.plan_id || localSub.plan) as PlanId;
          const currentPeriodEnd = new Date(
            ((stripeSub as any).current_period_end || Math.floor(Date.now() / 1000)) * 1000
          );

          // Check for drift
          const statusDrift = localSub.status !== stripeStatus;
          const planDrift = localSub.plan !== stripePlan;

          if (statusDrift || planDrift) {
            await db
              .update(subscriptions)
              .set({
                status: stripeStatus,
                plan: stripePlan,
                currentPeriodEnd,
              })
              .where(eq(subscriptions.userId, localSub.userId));

            const change = `user=${localSub.userId}: status ${localSub.status}→${stripeStatus}, plan ${localSub.plan}→${stripePlan}`;
            changes.push(change);
            log.info(`[Stripe Sync] Fixed drift: ${change}`);
          }
          synced++;
        } catch (err: unknown) {
          errors++;
          // If subscription not found in Stripe, mark as canceled locally
          if ((err as any)?.statusCode === 404 || (err as any)?.code === "resource_missing") {
            await db
              .update(subscriptions)
              .set({ status: "canceled", plan: "free", stripeSubscriptionId: null, currentPeriodEnd: new Date() })
              .where(eq(subscriptions.userId, localSub.userId));
            changes.push(`user=${localSub.userId}: Stripe sub not found, marked canceled`);
            log.warn(`[Stripe Sync] Subscription ${localSub.stripeSubscriptionId} not found in Stripe, marked user ${localSub.userId} as canceled`);
          } else {
            log.error(`[Stripe Sync] Error syncing user ${localSub.userId}:`, { error: getErrorMessage(err) });
          }
        }
      }

      log.info(`[Stripe Sync] Complete: synced=${synced}, errors=${errors}, changes=${changes.length}`);
      return res.json({ synced, errors, changes });
    } catch (err: unknown) {
      log.error("[Stripe Sync] Fatal error:", { error: getErrorMessage(err) });
      return res.status(500).json({ error: "Sync failed" });
    }
  });

  // ─── Monthly Credit Refill Cron Endpoint ─────────────────────────
  // Called by an external cron service (e.g., cron-job.org) on the 1st of each month
  // Also can be triggered manually by admin
  app.post("/api/cron/monthly-refill", async (req: Request, res: Response) => {
    // Verify cron secret or admin auth
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET || ENV.cookieSecret; // Reuse JWT secret as fallback

    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const result = await processAllMonthlyRefills();
      log.info(`[Cron] Monthly credit refill completed: ${result.processed} users processed, ${result.refilled} refilled`);
      res.json({ success: true, ...result });
    } catch (err: unknown) {
      log.error("[Cron] Monthly refill error:", { error: String(getErrorMessage(err)) });
      res.status(500).json({ error: "Refill processing failed", message: getErrorMessage(err) });
    }
  });
}

// ─── Batch Monthly Refill ──────────────────────────────────────────

export async function processAllMonthlyRefills(): Promise<{ processed: number; refilled: number; errors: number }> {
  const db = await getDb();
  if (!db) return { processed: 0, refilled: 0, errors: 0 };

  // Get all non-unlimited credit balance holders
  const allBalances = await db
    .select({ userId: creditBalances.userId })
    .from(creditBalances)
    .where(eq(creditBalances.isUnlimited, false));

  let processed = 0;
  let refilled = 0;
  let errors = 0;

  for (const bal of allBalances) {
    processed++;
    try {
      const result = await processMonthlyRefill(bal.userId);
      if (result) refilled++;
    } catch (err: unknown) {
      errors++;
      log.error(`[Cron] Refill error for user ${bal.userId}:`, { error: String(getErrorMessage(err)) });
    }
  }

  return { processed, refilled, errors };
}

// ─── Webhook Event Handlers ─────────────────────────────────────────

/**
 * Handle subscription created — catches subscriptions created outside checkout
 * (e.g., via Stripe dashboard or API). Ensures local DB stays in sync.
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const db = await getDb();
  if (!db) return;

  const userId = parseInt(subscription.metadata?.user_id || "0");
  const planId = (subscription.metadata?.plan_id || "pro") as PlanId;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || "";
  const currentPeriodEnd = new Date(
    ((subscription as any).current_period_end || Math.floor(Date.now() / 1000)) * 1000
  );

  // Skip Bazaar Seller subscriptions (handled separately)
  if (subscription.metadata?.type === "bazaar_seller") return;

  // If no userId in metadata, try to look up from customer ID
  let resolvedUserId = userId;
  if (!resolvedUserId && customerId) {
    resolvedUserId = (await getUserIdFromCustomerId(customerId)) || 0;
  }
  if (!resolvedUserId) {
    log.warn(`[Stripe Webhook] subscription.created: could not resolve userId for subscription ${subscription.id}`);
    return;
  }

  // Check if local record already exists (checkout.session.completed may have created it)
  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, resolvedUserId))
    .limit(1);

  if (existing.length > 0 && existing[0].stripeSubscriptionId === subscription.id) {
    // Already synced — no action needed
    return;
  }

  const status = mapStripeStatus(subscription.status);

  if (existing.length > 0) {
    await db
      .update(subscriptions)
      .set({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        plan: planId,
        status,
        currentPeriodEnd,
      })
      .where(eq(subscriptions.userId, resolvedUserId));
  } else {
    await db.insert(subscriptions).values({
      userId: resolvedUserId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      plan: planId,
      status,
      currentPeriodEnd,
    });
  }

  log.info(`[Stripe Webhook] Subscription created (sync): user=${resolvedUserId}, plan=${planId}, sub=${subscription.id}`);

  // ─── HIGH-VALUE REFERRAL CHECK ───
  // If this user was referred and just subscribed to Cyber+, reward the referrer
  // with 50% off their second year Pro annual membership
  try {
    const { checkHighValueReferralReward } = await import("./affiliate-engine");
    const result = await checkHighValueReferralReward(resolvedUserId, planId);
    if (result.rewarded && result.referrerId) {
      // Create a Stripe coupon for the referrer's next Pro annual renewal
      const stripe = getStripe();
      const couponId = `HVR_50PCT_PRO_ANNUAL_USER_${result.referrerId}`;
      try {
        await stripe.coupons.retrieve(couponId);
      } catch {
        await stripe.coupons.create({
          id: couponId,
          percent_off: 50,
          duration: "once",
          name: `High-Value Referral: 50% off Pro Annual (2nd year) for user ${result.referrerId}`,
          max_redemptions: 1,
        });
      }
      log.info(`[Stripe Webhook] Created 50% off Pro annual coupon ${couponId} for referrer ${result.referrerId}`);
    }
  } catch (e) {
    log.warn(`[Stripe Webhook] High-value referral check failed: ${getErrorMessage(e)}`);
  }

  // ─── TITAN REFERRAL UNLOCK CHECK ───
  // If this user was referred and just subscribed to Titan,
  // the referrer gets 3 months of unlocked Titan features
  try {
    const { checkTitanReferralReward } = await import("./affiliate-engine");
    const titanResult = await checkTitanReferralReward(resolvedUserId, planId);
    if (titanResult.rewarded && titanResult.referrerId) {
      log.info(
        `[Stripe Webhook] Titan referral unlock granted to user ${titanResult.referrerId} ` +
        `(3 months of Titan features) because user ${resolvedUserId} subscribed to ${planId}`
      );
    }
  } catch (e) {
    log.warn(`[Stripe Webhook] Titan referral check failed: ${getErrorMessage(e)}`);
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const db = await getDb();
  if (!db) return;

  const userId = parseInt(session.metadata?.user_id || session.client_reference_id || "0");

  // Handle credit pack purchases
  if (session.metadata?.type === "credit_pack") {
    const packId = session.metadata.pack_id;
    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    const credits = pack?.credits || parseInt(session.metadata.credits || "0");
    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || "";

    if (userId && credits > 0) {
      await addCredits(
        userId,
        credits,
        "pack_purchase",
        `Purchased ${pack?.name || "Credit Pack"}: +${credits} credits`,
        paymentIntentId
      );
      log.info(`[Stripe Webhook] Credit pack purchased: user=${userId}, pack=${packId}, credits=${credits}`);
    }
    return;
  }

  // Handle Marketplace item purchases (one-time payment)
  if (session.metadata?.type === "marketplace_purchase") {
    const listingId = parseInt(session.metadata.listing_id || "0");
    const sellerId = parseInt(session.metadata.seller_id || "0");
    const priceCredits = parseInt(session.metadata.price_credits || "0");
    const priceCents = parseInt(session.metadata.price_cents || "0");
    const listingUid = session.metadata.listing_uid || "";

    if (!userId || !listingId) {
      log.error("[Stripe Webhook] marketplace_purchase missing userId or listingId");
      return;
    }

    const { getListingById, getPurchaseByBuyerAndListing, createPurchase, getSellerProfile, updateSellerProfile } = await import("./db");
    const { creditBalances: creditBalancesTable, creditTransactions, marketplaceListings } = await import("../drizzle/schema");
    const { eq: eqOp, sql: sqlOp } = await import("drizzle-orm");

    // Idempotency: check if already purchased (webhook might fire twice)
    const existingPurchase = await getPurchaseByBuyerAndListing(userId, listingId);
    if (existingPurchase) {
      log.info(`[Stripe Webhook] marketplace_purchase already fulfilled: user=${userId}, listing=${listingId}`);
      return;
    }

    const listing = await getListingById(listingId);
    if (!listing) {
      log.error(`[Stripe Webhook] marketplace_purchase listing not found: ${listingId}`);
      return;
    }

    const PLATFORM_COMMISSION = 0.08;
    const sellerShareCredits = Math.floor(priceCredits * (1 - PLATFORM_COMMISSION));

    // Wrap seller credit + purchase record + listing stats in a transaction
    const { randomUUID } = await import("crypto");
    await db.transaction(async (tx) => {
      // Credit the seller in credits (92% of the credit-equivalent price)
      if (sellerShareCredits > 0 && sellerId) {
        const sellerBal = await tx.select({ credits: creditBalancesTable.credits }).from(creditBalancesTable).where(eqOp(creditBalancesTable.userId, sellerId)).for("update").limit(1);
        if (sellerBal.length === 0) {
          await tx.insert(creditBalancesTable).values({ userId: sellerId, credits: sellerShareCredits, lifetimeCreditsAdded: sellerShareCredits } as any);
        } else {
          await tx.update(creditBalancesTable).set({
            credits: sqlOp`${creditBalancesTable.credits} + ${sellerShareCredits}`,
            lifetimeCreditsAdded: sqlOp`${creditBalancesTable.lifetimeCreditsAdded} + ${sellerShareCredits}`,
          }).where(eqOp(creditBalancesTable.userId, sellerId));
        }
        const sellerUpdated = await tx.select({ credits: creditBalancesTable.credits }).from(creditBalancesTable).where(eqOp(creditBalancesTable.userId, sellerId)).limit(1);
        await tx.insert(creditTransactions).values({
          userId: sellerId,
          amount: sellerShareCredits,
          type: "marketplace_sale",
          description: `Stripe sale of "${listing.title}" (${listingUid}) — 92% of ${priceCredits} credits ($${(priceCents / 100).toFixed(2)} paid via card)`,
          balanceAfter: sellerUpdated[0]?.credits ?? 0,
        });

        // Update seller profile stats
        const sellerProfile = await getSellerProfile(sellerId);
        if (sellerProfile) {
          await updateSellerProfile(sellerId, {
            totalSales: (sellerProfile.totalSales || 0) + 1,
            totalRevenue: (sellerProfile.totalRevenue || 0) + sellerShareCredits,
          });
        }
      }

      // Create purchase record
      const purchaseUid = `PUR-${randomUUID().split("-").slice(0, 2).join("")}`.toUpperCase();
      const downloadToken = randomUUID();

      await createPurchase({
        uid: purchaseUid,
        buyerId: userId,
        listingId,
        sellerId,
        priceCredits,
        priceUsd: priceCents,
        downloadToken,
      });

      // Update listing stats
      await tx.update(marketplaceListings).set({
        totalSales: sqlOp`${marketplaceListings.totalSales} + 1`,
        totalRevenue: sqlOp`${marketplaceListings.totalRevenue} + ${sellerShareCredits}`,
      }).where(eqOp(marketplaceListings.id, listingId));
    });

    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "";
    log.info(`[Stripe Webhook] Marketplace purchase completed: buyer=${userId}, listing=${listingId} (${listingUid}), paid=$${(priceCents / 100).toFixed(2)}, seller_share=${sellerShareCredits} credits, payment_intent=${paymentIntentId}`);
    return;
  }

  // Handle Bazaar Seller one-time registration payment (from marketplace-router becomeSeller)
  if (session.metadata?.type === "bazaar_seller_registration") {
    const displayName = session.metadata.display_name || "Seller";
    const bio = session.metadata.bio || null;

    if (userId) {
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      const existingProfile = await db
        .select()
        .from(sellerProfiles)
        .where(eq(sellerProfiles.userId, userId))
        .limit(1);

      if (existingProfile.length > 0) {
        await db
          .update(sellerProfiles)
          .set({
            displayName,
            bio: bio || existingProfile[0].bio,
            sellerSubscriptionActive: true,
            sellerSubscriptionExpiresAt: expiresAt,
            sellerSubscriptionPaidAt: new Date(),
          })
          .where(eq(sellerProfiles.userId, userId));
      } else {
        await db.insert(sellerProfiles).values({
          userId,
          displayName,
          bio,
          sellerSubscriptionActive: true,
          sellerSubscriptionExpiresAt: expiresAt,
          sellerSubscriptionPaidAt: new Date(),
        });
      }

      log.info(`[Stripe Webhook] Bazaar Seller registration (one-time) activated: user=${userId}, expires=${expiresAt.toISOString()}`);
    }
    return;
  }

  // Handle Bazaar Seller subscription purchases
  if (session.metadata?.type === "bazaar_seller") {
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || "";
    const displayName = session.metadata.display_name || "Seller";
    const bio = session.metadata.bio || null;

    if (userId) {
      // Create or update seller profile with active subscription
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      const existingProfile = await db
        .select()
        .from(sellerProfiles)
        .where(eq(sellerProfiles.userId, userId))
        .limit(1);

      if (existingProfile.length > 0) {
        await db
          .update(sellerProfiles)
          .set({
            displayName,
            bio: bio || existingProfile[0].bio,
            sellerSubscriptionActive: true,
            sellerSubscriptionExpiresAt: expiresAt,
            sellerSubscriptionPaidAt: new Date(),
            sellerSubscriptionStripeId: subscriptionId,
          })
          .where(eq(sellerProfiles.userId, userId));
      } else {
        await db.insert(sellerProfiles).values({
          userId,
          displayName,
          bio,
          sellerSubscriptionActive: true,
          sellerSubscriptionExpiresAt: expiresAt,
          sellerSubscriptionPaidAt: new Date(),
          sellerSubscriptionStripeId: subscriptionId,
        });
      }

      log.info(`[Stripe Webhook] Bazaar Seller subscription activated: user=${userId}, subscription=${subscriptionId}, expires=${expiresAt.toISOString()}`);
    }
    return;
  }

  const planId = (session.metadata?.plan_id || "pro") as PlanId;
  const isTrial = session.metadata?.is_trial === "true";
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id || "";
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id || "";

  if (!userId || !customerId) {
    log.error("[Stripe Webhook] Missing userId or customerId in checkout session");
    return;
  }

  // If this is a trial signup, activate the 7-day trial on the user record
  if (isTrial && userId) {
    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days
    await db.update(users).set({
      hasPaymentMethod: true,
      stripeCustomerId: customerId,
      trialStartedAt: trialStart,
      trialEndsAt: trialEnd,
    }).where(eq(users.id, userId));
    log.info(`[Stripe Webhook] Trial activated: user=${userId}, trial_ends=${trialEnd.toISOString()}`);
  }

  // Upsert subscription record
  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(subscriptions)
      .set({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        plan: planId,
        status: "active",
      })
      .where(eq(subscriptions.userId, userId));
  } else {
    await db.insert(subscriptions).values({
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      plan: planId,
      status: "active",
    });
  }

  // Grant initial monthly credit allocation for the new subscription
  const tier = PRICING_TIERS.find((t) => t.id === planId);
  if (tier && tier.credits.monthlyAllocation > 0) {
    await addCredits(
      userId,
      tier.credits.monthlyAllocation,
      "monthly_refill",
      `Initial ${tier.name} plan credits: +${tier.credits.monthlyAllocation} credits`
    );
    log.info(`[Stripe Webhook] Initial credits granted: user=${userId}, plan=${planId}, credits=${tier.credits.monthlyAllocation}`);
  }

  log.info(`[Stripe Webhook] Checkout completed: user=${userId}, plan=${planId}, subscription=${subscriptionId}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const db = await getDb();
  if (!db) return;

  // Handle Bazaar Seller subscription updates
  if (subscription.metadata?.type === "bazaar_seller") {
    const userId = parseInt(subscription.metadata.user_id || "0");
    if (userId) {
      const status = mapStripeStatus(subscription.status);
      if (status === "canceled" || status === "past_due") {
        await db
          .update(sellerProfiles)
          .set({ sellerSubscriptionActive: false })
          .where(eq(sellerProfiles.userId, userId));
        log.info(`[Stripe Webhook] Bazaar Seller subscription ${status} for user=${userId}`);
      } else if (status === "active") {
        const newExpiry = new Date();
        newExpiry.setFullYear(newExpiry.getFullYear() + 1);
        await db
          .update(sellerProfiles)
          .set({
            sellerSubscriptionActive: true,
            sellerSubscriptionExpiresAt: newExpiry,
            sellerSubscriptionPaidAt: new Date(),
          })
          .where(eq(sellerProfiles.userId, userId));
        log.info(`[Stripe Webhook] Bazaar Seller subscription renewed for user=${userId}`);
      }
    }
    return;
  }

  const planId = (subscription.metadata?.plan_id || "pro") as PlanId;
  const status = mapStripeStatus(subscription.status);
  const currentPeriodEnd = new Date(
    ((subscription as any).current_period_end || Math.floor(Date.now() / 1000)) * 1000
  );

  // Get the subscription record to find userId
  const subRecord = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
    .limit(1);

  const previousPlan = subRecord[0]?.plan as PlanId | undefined;

  await db
    .update(subscriptions)
    .set({
      plan: planId,
      status,
      currentPeriodEnd,
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

  // If plan changed (upgrade or downgrade), handle credit difference
  if (previousPlan && previousPlan !== planId && subRecord[0]) {
    const newTier = PRICING_TIERS.find((t) => t.id === planId);
    const oldTier = PRICING_TIERS.find((t) => t.id === previousPlan);
    log.info(`[Stripe Webhook] Plan changed: user=${subRecord[0].userId}, ${oldTier?.name || previousPlan} → ${newTier?.name || planId}`);

    // Grant credit difference on upgrade
    if (oldTier && newTier && newTier.credits.monthlyAllocation > oldTier.credits.monthlyAllocation) {
      const creditDiff = newTier.credits.monthlyAllocation - oldTier.credits.monthlyAllocation;
      await addCredits(
        subRecord[0].userId,
        creditDiff,
        "admin_adjustment",
        `Plan upgrade via webhook (${oldTier.name} → ${newTier.name}): +${creditDiff} bonus credits`
      );
      log.info(`[Stripe Webhook] Upgrade credit bonus: user=${subRecord[0].userId}, +${creditDiff} credits`);
    }
  }

  log.info(`[Stripe Webhook] Subscription updated: ${subscription.id}, status=${status}, plan=${planId}`);
}

/**
 * Handle subscription deletion (cancellation completed).
 * IMPORTANT: We keep the user's remaining credits — they are NOT zeroed out.
 * The user simply won't get any more monthly refills.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const db = await getDb();
  if (!db) return;

  // Handle Bazaar Seller subscription deletion
  if (subscription.metadata?.type === "bazaar_seller") {
    const userId = parseInt(subscription.metadata.user_id || "0");
    if (userId) {
      await db
        .update(sellerProfiles)
        .set({
          sellerSubscriptionActive: false,
          sellerSubscriptionStripeId: null,
        })
        .where(eq(sellerProfiles.userId, userId));
      log.info(`[Stripe Webhook] Bazaar Seller subscription canceled for user=${userId}. Listings will be deactivated.`);
    }
    return;
  }

  // Get userId before updating
  const subRecord = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
    .limit(1);

  await db
    .update(subscriptions)
    .set({
      plan: "free",
      status: "canceled",
      stripeSubscriptionId: null,
      currentPeriodEnd: new Date(), // Clear stale period end date
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

  if (subRecord[0]) {
    log.info(`[Stripe Webhook] Subscription deleted for user=${subRecord[0].userId}. Credits preserved — no more monthly refills.`);
  }
}

/**
 * Handle invoice.paid — this fires on every successful subscription payment,
 * including the initial payment AND all subsequent auto-renewals.
 * 
 * On renewal (not the first invoice), we process the monthly credit refill.
 * This is the core auto-renewal billing logic:
 * - Stripe auto-charges the customer
 * - We receive invoice.paid webhook
 * - We refill the user's credits based on their plan tier
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const db = await getDb();
  if (!db) return;

  const subId = typeof (invoice as any).subscription === "string"
    ? (invoice as any).subscription
    : (invoice as any).subscription?.id;

  if (!subId) {
    // Not a subscription invoice (could be a one-time credit pack purchase)
    log.info(`[Stripe Webhook] Invoice paid (non-subscription): ${invoice.id}`);
    return;
  }

  // Find the user from the subscription
  const subRecord = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subId))
    .limit(1);

  if (subRecord.length === 0) {
    log.info(`[Stripe Webhook] Invoice paid but no matching subscription found: sub=${subId}`);
    return;
  }

  const userId = subRecord[0].userId;
  const planId = subRecord[0].plan as PlanId;

  // Check if this is a renewal (not the first invoice)
  // billing_reason can be: "subscription_create", "subscription_cycle", "subscription_update", etc.
  const billingReason = (invoice as any).billing_reason;

  if (billingReason === "subscription_cycle") {
    // This is an auto-renewal payment — refill credits!
    const tier = PRICING_TIERS.find((t) => t.id === planId);
    const allocation = tier?.credits.monthlyAllocation ?? 0;

    if (allocation > 0) {
      await addCredits(
        userId,
        allocation,
        "monthly_refill",
        `Auto-renewal credit refill (${tier?.name || planId} plan): +${allocation} credits`,
        typeof (invoice as any).payment_intent === "string" ? (invoice as any).payment_intent : (invoice as any).payment_intent?.id
      );
      log.info(`[Stripe Webhook] Auto-renewal refill: user=${userId}, plan=${planId}, credits=+${allocation}`);
    }
  } else if (billingReason === "subscription_update") {
    // Plan was changed (upgrade/downgrade) — the proration invoice was paid
    log.info(`[Stripe Webhook] Plan change invoice paid: user=${userId}, plan=${planId}`);
  } else {
    // First invoice (subscription_create) — credits already granted in handleCheckoutCompleted
    log.info(`[Stripe Webhook] Initial invoice paid: user=${userId}, plan=${planId}, reason=${billingReason}`);
  }
}

/**
 * Handle failed invoice payment — mark subscription as past_due.
 * Credits are preserved but no new refills will happen until payment succeeds.
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const db = await getDb();
  if (!db) return;

  const subId = typeof (invoice as any).subscription === "string"
    ? (invoice as any).subscription
    : (invoice as any).subscription?.id;

  if (subId) {
    const subscriptionId = typeof subId === "string" ? subId : subId;
    await db
      .update(subscriptions)
      .set({ status: "past_due" })
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

    log.info(`[Stripe Webhook] Invoice payment failed: ${invoice.id}, subscription marked past_due`);
  }
}

function mapStripeStatus(
  stripeStatus: string
): "active" | "canceled" | "past_due" | "incomplete" | "trialing" {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "past_due":
      return "past_due";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    case "trialing":
      return "trialing";
    default:
      return "active";
  }
}
