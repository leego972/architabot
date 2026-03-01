/**
 * Marketplace Router — Grand Bazaar
 * Full marketplace for selling code, AI agents, modules, blueprints, and artifacts.
 * Features: credit-based purchasing, AI risk review, user ratings, unique item IDs.
 */

import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { consumeCredits, addCredits, getCreditBalance } from "./credit-service";
import { randomUUID } from "crypto";
import { seedMarketplaceWithMerchants } from "./marketplace-seed";
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { safeDDLStatement } from "./_core/sql-sanitize.js";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
import {
  trackPurchase,
  checkUserRateLimit,
  logSecurityEvent,
  signModuleContent,
} from "./security-hardening";
import { auditQueryParam } from "./security-fortress";
const log = createLogger("MarketplaceRouter");

// ─── Constants ───────────────────────────────────────────────────
const SELLER_ANNUAL_FEE_USD = 1200; // $12.00 in cents
const SELLER_ANNUAL_FEE_CREDITS = 1200; // 1200 credits = $12 equivalent
const PLATFORM_COMMISSION_RATE = 0.08; // 8% commission on every sale

// ─── Helpers ──────────────────────────────────────────────────────

/** Check if a seller has an active subscription */
function isSellerSubscriptionActive(profile: any): boolean {
  if (!profile) return false;
  if (!profile.sellerSubscriptionActive) return false;
  if (!profile.sellerSubscriptionExpiresAt) return false;
  return new Date(profile.sellerSubscriptionExpiresAt) > new Date();
}

function generateUid(): string {
  return `MKT-${randomUUID().split("-").slice(0, 2).join("")}`.toUpperCase();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 280);
}

/** AI-powered risk categorization for uploaded items */
async function reviewItemRisk(title: string, description: string, category: string, tags: string): Promise<{
  riskCategory: "safe" | "low_risk" | "medium_risk" | "high_risk";
  reviewNotes: string;
  autoApprove: boolean;
}> {
  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a marketplace content reviewer for Archibald Titan, a cybersecurity and AI platform.
Categorize items by risk level:
- "safe": Normal code, templates, datasets, educational content
- "low_risk": Security tools, penetration testing utilities, network scanners
- "medium_risk": Exploit frameworks, vulnerability scanners, offensive security tools
- "high_risk": Zero-day exploits, malware samples, C2 frameworks, credential stealers

Items in "high_risk" are allowed on the platform but require a warning label.
The platform facilitates sale of security tools and code but disclaims liability for misuse.

Respond in JSON format ONLY:
{"riskCategory": "safe|low_risk|medium_risk|high_risk", "reviewNotes": "brief explanation", "autoApprove": true|false}

Auto-approve safe and low_risk items. Medium and high risk require manual review.`,
        },
        {
          role: "user",
          content: `Review this marketplace listing:
Title: ${title}
Category: ${category}
Description: ${description}
Tags: ${tags}`,
        },
      ],
      model: "fast",
      temperature: 0.1,
      priority: "background",
    });

    const content = result.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        riskCategory: parsed.riskCategory || "safe",
        reviewNotes: parsed.reviewNotes || "",
        autoApprove: parsed.autoApprove !== false,
      };
    }
  } catch (e) {
    log.warn("[Marketplace] AI review failed, defaulting to pending:", { error: String(e) });
  }
  return { riskCategory: "safe", reviewNotes: "AI review unavailable — pending manual review", autoApprove: false };
}

// ─── Marketplace Listings Router ──────────────────────────────────

export const marketplaceRouter = router({
  /** Browse marketplace listings (public) */
  browse: protectedProcedure
    .input(
      z.object({
        category: z.string().optional(),
        search: z.string().optional(),
        riskCategory: z.string().optional(),
        sortBy: z.string().optional(),
        featured: z.boolean().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      // ── SECURITY: SQL Injection Audit on search inputs ─────────
      if (input?.search) {
        const sqlCheck = await auditQueryParam("search", input.search, 0);
        if (sqlCheck.blocked) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid search query" });
        }
      }

      const listings = await db.listMarketplaceListings({
        category: input?.category,
        search: input?.search,
        riskCategory: input?.riskCategory,
        sortBy: input?.sortBy,
        featured: input?.featured,
        limit: input?.limit || 50,
        offset: input?.offset || 0,
        status: "active",
      });
      // Sanitize tags: ensure they're valid JSON arrays
      return listings.map((l: any) => {
        if (l.tags && typeof l.tags === 'string') {
          try { JSON.parse(l.tags); } catch {
            l.tags = JSON.stringify(l.tags.split(',').map((t: string) => t.trim()).filter(Boolean));
          }
        }
        return l;
      });
    }),

  /** Get listing detail by ID */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const listing = await db.getListingById(input.id);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
      await db.incrementListingViews(input.id);
      // Sanitize tags: ensure they're valid JSON arrays
      if (listing.tags && typeof listing.tags === 'string') {
        try { JSON.parse(listing.tags); } catch {
          (listing as any).tags = JSON.stringify(listing.tags.split(',').map((t: string) => t.trim()).filter(Boolean));
        }
      }
      const reviews = await db.getReviewsByListing(input.id);
      const seller = await db.getSellerProfile(listing.sellerId);
      return { listing, reviews, seller };
    }),

  /** Get listing by slug */
  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const listing = await db.getListingBySlug(input.slug);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
      await db.incrementListingViews(listing.id);
      const reviews = await db.getReviewsByListing(listing.id);
      const seller = await db.getSellerProfile(listing.sellerId);
      return { listing, reviews, seller };
    }),

  /** Become a seller — pay $12/year registration fee */
  becomeSeller: protectedProcedure
    .input(z.object({
      displayName: z.string().min(2).max(128),
      bio: z.string().max(2000).optional(),
      payWithCredits: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });

      // Check if already an active seller
      const existingProfile = await db.getSellerProfile(ctx.user.id);
      if (existingProfile && isSellerSubscriptionActive(existingProfile)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You already have an active seller subscription" });
      }

      if (input.payWithCredits) {
        // Pay with credits
        const balance = await getCreditBalance(ctx.user.id);
        if (balance.credits < SELLER_ANNUAL_FEE_CREDITS && !balance.isUnlimited) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Seller registration costs ${SELLER_ANNUAL_FEE_CREDITS} credits ($12/year). You have ${balance.credits} credits.` });
        }
        if (!balance.isUnlimited) {
          const dbInstance = await getDb();
          if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          const { creditBalances, creditTransactions } = await import("../drizzle/schema");
          const { eq, sql: sqlOp } = await import("drizzle-orm");
          await dbInstance.update(creditBalances).set({
            credits: sqlOp`${creditBalances.credits} - ${SELLER_ANNUAL_FEE_CREDITS}`,
            lifetimeCreditsUsed: sqlOp`${creditBalances.lifetimeCreditsUsed} + ${SELLER_ANNUAL_FEE_CREDITS}`,
          }).where(eq(creditBalances.userId, ctx.user.id));
          const updatedBal = await dbInstance.select({ credits: creditBalances.credits }).from(creditBalances).where(eq(creditBalances.userId, ctx.user.id)).limit(1);
          await dbInstance.insert(creditTransactions).values({
            userId: ctx.user.id,
            amount: -SELLER_ANNUAL_FEE_CREDITS,
            type: "marketplace_seller_fee",
            description: `Bazaar Seller Registration — $12/year annual fee`,
            balanceAfter: updatedBal[0]?.credits ?? 0,
          });
        }
      }
      // Stripe payment path — redirect to Stripe Checkout for seller registration
      if (!input.payWithCredits) {
        // Import Stripe checkout helper from stripe-router
        const Stripe = (await import("stripe")).default;
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe not configured" });
        const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" as any });

        // Get or create Stripe customer
        const { users: usersTable } = await import("../drizzle/schema");
        const { eq: eqOp2 } = await import("drizzle-orm");
        const dbInst = await getDb();
        if (!dbInst) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const userRows = await dbInst.select().from(usersTable).where(eqOp2(usersTable.id, ctx.user.id)).limit(1);
        let customerId = userRows[0]?.stripeCustomerId;
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: ctx.user.email || undefined,
            name: ctx.user.name || undefined,
            metadata: { userId: ctx.user.id.toString(), platform: "archibald-titan" },
          });
          customerId = customer.id;
          await dbInst.update(usersTable).set({ stripeCustomerId: customer.id }).where(eqOp2(usersTable.id, ctx.user.id));
        }

        const origin = (ctx.req as any)?.headers?.origin || "https://www.archibaldtitan.com";
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          client_reference_id: ctx.user.id.toString(),
          mode: "payment",
          line_items: [{
            price_data: {
              currency: "usd",
              unit_amount: SELLER_ANNUAL_FEE_USD,
              product_data: {
                name: "Bazaar Seller Registration",
                description: "Annual seller subscription — list and sell items on the Archibald Titan Bazaar for 1 year",
              },
            },
            quantity: 1,
          }],
          success_url: `${origin}/marketplace?seller_registered=true`,
          cancel_url: `${origin}/marketplace?seller_canceled=true`,
          metadata: {
            type: "bazaar_seller_registration",
            user_id: ctx.user.id.toString(),
            display_name: input.displayName,
            bio: (input.bio || "").slice(0, 200),
          },
        });

        return {
          success: true,
          stripeCheckoutUrl: session.url,
          message: "Redirecting to Stripe for $12 seller registration payment.",
          expiresAt: "",
          feePaid: 0,
        };
      }

      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      if (existingProfile) {
        // Renew subscription
        await db.updateSellerProfile(ctx.user.id, {
          displayName: input.displayName,
          bio: input.bio || existingProfile.bio,
          sellerSubscriptionActive: true,
          sellerSubscriptionExpiresAt: expiresAt,
          sellerSubscriptionPaidAt: new Date(),
        } as any);
      } else {
        // Create new seller profile with subscription
        const profile = await db.getOrCreateSellerProfile(ctx.user.id, input.displayName);
        await db.updateSellerProfile(ctx.user.id, {
          bio: input.bio || null,
          sellerSubscriptionActive: true,
          sellerSubscriptionExpiresAt: expiresAt,
          sellerSubscriptionPaidAt: new Date(),
        } as any);
      }

      return {
        success: true,
        message: "Welcome to the Bazaar! Your seller stall is now active for 1 year.",
        expiresAt: expiresAt.toISOString(),
        feePaid: SELLER_ANNUAL_FEE_CREDITS,
      };
    }),

  /** Check seller subscription status */
  sellerStatus: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
    const profile = await db.getSellerProfile(ctx.user.id);
    if (!profile) {
      return { isSeller: false, isActive: false, profile: null };
    }
    const isActive = isSellerSubscriptionActive(profile);
    return {
      isSeller: true,
      isActive,
      expiresAt: profile.sellerSubscriptionExpiresAt,
      paidAt: profile.sellerSubscriptionPaidAt,
      profile,
    };
  }),

  /** Renew seller subscription */
  renewSeller: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
    const profile = await db.getSellerProfile(ctx.user.id);
    if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "No seller profile found. Use becomeSeller first." });

    const balance = await getCreditBalance(ctx.user.id);
    if (balance.credits < SELLER_ANNUAL_FEE_CREDITS && !balance.isUnlimited) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Renewal costs ${SELLER_ANNUAL_FEE_CREDITS} credits ($12/year). You have ${balance.credits} credits.` });
    }
    if (!balance.isUnlimited) {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { creditBalances, creditTransactions } = await import("../drizzle/schema");
      const { eq, sql: sqlOp } = await import("drizzle-orm");
      await dbInstance.update(creditBalances).set({
        credits: sqlOp`${creditBalances.credits} - ${SELLER_ANNUAL_FEE_CREDITS}`,
        lifetimeCreditsUsed: sqlOp`${creditBalances.lifetimeCreditsUsed} + ${SELLER_ANNUAL_FEE_CREDITS}`,
      }).where(eq(creditBalances.userId, ctx.user.id));
      const updatedBal = await dbInstance.select({ credits: creditBalances.credits }).from(creditBalances).where(eq(creditBalances.userId, ctx.user.id)).limit(1);
      await dbInstance.insert(creditTransactions).values({
        userId: ctx.user.id,
        amount: -SELLER_ANNUAL_FEE_CREDITS,
        type: "marketplace_seller_renewal",
        description: `Bazaar Seller Renewal — $12/year annual fee`,
        balanceAfter: updatedBal[0]?.credits ?? 0,
      });
    }

    // Extend from current expiry or now, whichever is later
    const currentExpiry = profile.sellerSubscriptionExpiresAt ? new Date(profile.sellerSubscriptionExpiresAt) : new Date();
    const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
    const newExpiry = new Date(baseDate);
    newExpiry.setFullYear(newExpiry.getFullYear() + 1);

    await db.updateSellerProfile(ctx.user.id, {
      sellerSubscriptionActive: true,
      sellerSubscriptionExpiresAt: newExpiry,
      sellerSubscriptionPaidAt: new Date(),
    } as any);

    return { success: true, message: "Seller subscription renewed for 1 year.", expiresAt: newExpiry.toISOString() };
  }),

  /** Create a new listing (seller — requires active $12/year subscription) */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(256),
        description: z.string().min(10),
        longDescription: z.string().optional(),
        category: z.enum(["agents", "modules", "blueprints", "artifacts", "exploits", "templates", "datasets", "other"]),
        priceCredits: z.number().min(0),
        priceUsd: z.number().min(0).optional(),
        tags: z.string().optional(),
        language: z.string().optional(),
        license: z.string().optional(),
        version: z.string().optional(),
        fileUrl: z.string().optional(),
        fileSize: z.number().optional(),
        fileType: z.string().optional(),
        previewUrl: z.string().optional(),
        thumbnailUrl: z.string().optional(),
        demoUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });

      // ── SELLER SUBSCRIPTION GATE ──
      const sellerProfile = await db.getSellerProfile(ctx.user.id);
      if (!sellerProfile || !isSellerSubscriptionActive(sellerProfile)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You need an active Bazaar seller subscription ($12/year) to list items. Use 'Become a Seller' to register.",
        });
      }

      // Ensure seller profile exists
      const displayName = ctx.user.name || ctx.user.email || "Anonymous Seller";
      await db.getOrCreateSellerProfile(ctx.user.id, displayName);

      const uid = generateUid();
      const slug = slugify(input.title) + "-" + uid.slice(-6).toLowerCase();

      // AI risk review
      const review = await reviewItemRisk(
        input.title,
        input.description,
        input.category,
        input.tags || ""
      );

      const result = await db.createListing({
        uid,
        sellerId: ctx.user.id,
        title: input.title,
        slug,
        description: input.description,
        longDescription: input.longDescription || null,
        category: input.category,
        priceCredits: input.priceCredits,
        priceUsd: input.priceUsd || 0,
        tags: input.tags ? JSON.stringify(input.tags.split(",").map(t => t.trim()).filter(Boolean)) : null,
        language: input.language || null,
        license: input.license || "MIT",
        version: input.version || "1.0.0",
        fileUrl: input.fileUrl || null,
        fileSize: input.fileSize || null,
        fileType: input.fileType || null,
        previewUrl: input.previewUrl || null,
        thumbnailUrl: input.thumbnailUrl || null,
        demoUrl: input.demoUrl || null,
        riskCategory: review.riskCategory,
        reviewStatus: review.autoApprove ? "approved" : "pending_review",
        reviewNotes: review.reviewNotes,
        status: review.autoApprove ? "active" : "draft",
      });

      return {
        id: result.id,
        uid,
        slug,
        riskCategory: review.riskCategory,
        reviewStatus: review.autoApprove ? "approved" : "pending_review",
        reviewNotes: review.reviewNotes,
      };
    }),

  /** Update a listing (seller only) */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(3).max(256).optional(),
        description: z.string().min(10).optional(),
        longDescription: z.string().optional(),
        category: z.enum(["agents", "modules", "blueprints", "artifacts", "exploits", "templates", "datasets", "other"]).optional(),
        priceCredits: z.number().min(0).optional(),
        priceUsd: z.number().min(0).optional(),
        tags: z.string().optional(),
        language: z.string().optional(),
        license: z.string().optional(),
        version: z.string().optional(),
        fileUrl: z.string().optional(),
        fileSize: z.number().optional(),
        fileType: z.string().optional(),
        previewUrl: z.string().optional(),
        thumbnailUrl: z.string().optional(),
        demoUrl: z.string().optional(),
        status: z.enum(["draft", "active", "paused"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
      const listing = await db.getListingById(input.id);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
      if (listing.sellerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your listing" });
      }

      const { id, ...updateData } = input;
      // Ensure tags are stored as JSON array
      if ((updateData as any).tags && typeof (updateData as any).tags === 'string') {
        try { JSON.parse((updateData as any).tags); } catch { (updateData as any).tags = JSON.stringify((updateData as any).tags.split(',').map((t:string) => t.trim()).filter(Boolean)); }
      }
      // If title/description changed, re-run risk revieww
      if (input.title || input.description) {
        const review = await reviewItemRisk(
          input.title || listing.title,
          input.description || listing.description,
          (input.category || listing.category) as string,
          input.tags || listing.tags || ""
        );
        (updateData as any).riskCategory = review.riskCategory;
        if (!review.autoApprove) {
          (updateData as any).reviewStatus = "pending_review";
          (updateData as any).status = "draft";
        }
        (updateData as any).reviewNotes = review.reviewNotes;
      }

      await db.updateListing(input.id, updateData as any);
      return { success: true };
    }),

  /** Delete a listing (seller only) */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
      const listing = await db.getListingById(input.id);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
      if (listing.sellerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your listing" });
      }
      await db.deleteListing(input.id);
      return { success: true };
    }),

  /** Get my listings (seller view) */
  myListings: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
    return db.listMarketplaceListings({ sellerId: ctx.user.id });
  }),

  /** Purchase a listing */
  purchase: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });

      // ── SECURITY: Per-User Purchase Rate Limiting ──────────────────
      const rateCheck = await checkUserRateLimit(ctx.user.id, "marketplace:purchase");
      if (!rateCheck.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Purchase rate limit exceeded. Please wait ${Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)}s.`,
        });
      }

      // ── SECURITY: Purchase Velocity Fraud Detection ────────────────
      const listing = await db.getListingById(input.listingId);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });

      const velocityCheck = await trackPurchase(ctx.user.id, listing.priceCredits);
      if (!velocityCheck.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: velocityCheck.reason || "Unusual purchase activity detected. Please try again later.",
        });
      }

      if (listing.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Listing is not available" });
      if (listing.reviewStatus !== "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "Listing is pending review" });
      if (listing.sellerId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot purchase your own listing" });

      // Check if already purchased
      const existing = await db.getPurchaseByBuyerAndListing(ctx.user.id, input.listingId);
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Already purchased" });

      // Execute the entire purchase in a DB transaction to prevent race conditions
      const dbInstance = await db.getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { creditBalances, creditTransactions } = await import("../drizzle/schema");
      const { eq, sql } = await import("drizzle-orm");

      return await dbInstance.transaction(async (tx) => {
        // Lock buyer's credit row with SELECT FOR UPDATE to prevent double-spend
        const buyerBal = await tx
          .select({ credits: creditBalances.credits, isUnlimited: creditBalances.isUnlimited })
          .from(creditBalances)
          .where(eq(creditBalances.userId, ctx.user.id))
          .for("update")
          .limit(1);

        if (buyerBal.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No credit balance found" });

        if (buyerBal[0].credits < listing.priceCredits && !buyerBal[0].isUnlimited) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient credits. Need ${listing.priceCredits}, have ${buyerBal[0].credits}` });
        }

        // Deduct credits from buyer
        if (!buyerBal[0].isUnlimited) {
          await tx.update(creditBalances).set({
            credits: sql`${creditBalances.credits} - ${listing.priceCredits}`,
            lifetimeCreditsUsed: sql`${creditBalances.lifetimeCreditsUsed} + ${listing.priceCredits}`,
          }).where(eq(creditBalances.userId, ctx.user.id));
        }

        // Get updated buyer balance
        const updatedBal = await tx.select({ credits: creditBalances.credits }).from(creditBalances).where(eq(creditBalances.userId, ctx.user.id)).limit(1);
        const buyerBalanceAfter = updatedBal[0]?.credits ?? 0;

        // Log buyer transaction
        await tx.insert(creditTransactions).values({
          userId: ctx.user.id,
          amount: -listing.priceCredits,
          type: "marketplace_purchase",
          description: `Purchased "${listing.title}" (${listing.uid})`,
          balanceAfter: buyerBalanceAfter,
        });

        // Credit seller (92% of price — 8% platform commission)
        const sellerShare = Math.floor(listing.priceCredits * (1 - PLATFORM_COMMISSION_RATE));
        if (sellerShare > 0) {
          // Ensure seller has a balance row, then lock it
          const sellerBal = await tx.select({ credits: creditBalances.credits }).from(creditBalances).where(eq(creditBalances.userId, listing.sellerId)).for("update").limit(1);
          if (sellerBal.length === 0) {
            await tx.insert(creditBalances).values({ userId: listing.sellerId, credits: sellerShare, lifetimeCreditsAdded: sellerShare });
          } else {
            await tx.update(creditBalances).set({
              credits: sql`${creditBalances.credits} + ${sellerShare}`,
              lifetimeCreditsAdded: sql`${creditBalances.lifetimeCreditsAdded} + ${sellerShare}`,
            }).where(eq(creditBalances.userId, listing.sellerId));
          }

          const sellerUpdated = await tx.select({ credits: creditBalances.credits }).from(creditBalances).where(eq(creditBalances.userId, listing.sellerId)).limit(1);
          await tx.insert(creditTransactions).values({
            userId: listing.sellerId,
            amount: sellerShare,
            type: "marketplace_sale",
            description: `Sale of "${listing.title}" (${listing.uid}) — ${Math.round((1 - PLATFORM_COMMISSION_RATE) * 100)}% of ${listing.priceCredits} credits (8% platform fee)`,
            balanceAfter: sellerUpdated[0]?.credits ?? 0,
          });

          // Update seller profile stats (outside tx is fine — non-critical)
          const sellerProfile = await db.getSellerProfile(listing.sellerId);
          if (sellerProfile) {
            await db.updateSellerProfile(listing.sellerId, {
              totalSales: (sellerProfile.totalSales || 0) + 1,
              totalRevenue: (sellerProfile.totalRevenue || 0) + sellerShare,
            });
          }
        }

        // Create purchase record
        const purchaseUid = `PUR-${randomUUID().split("-").slice(0, 2).join("")}`.toUpperCase();
        const downloadToken = randomUUID();
        const purchase = await db.createPurchase({
          uid: purchaseUid,
          buyerId: ctx.user.id,
          listingId: input.listingId,
          sellerId: listing.sellerId,
          priceCredits: listing.priceCredits,
          priceUsd: listing.priceUsd,
          downloadToken,
        });

        return {
          purchaseId: purchase.id,
          uid: purchaseUid,
          downloadToken,
          priceCredits: listing.priceCredits,
          sellerShare,
          platformFee: listing.priceCredits - sellerShare,
        };
      });
    }),

  /** Get my purchases (inventory) */
  myPurchases: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
    const purchases = await db.getPurchasesByBuyer(ctx.user.id);
    // Enrich with listing details
    const enriched = await Promise.all(
      purchases.map(async (p) => {
        const listing = await db.getListingById(p.listingId);
        return { ...p, listing };
      })
    );
    return enriched;
  }),

  /** Get sales for seller */
  mySales: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
    const sales = await db.getPurchasesBySeller(ctx.user.id);
    const enriched = await Promise.all(
      sales.map(async (s) => {
        const listing = await db.getListingById(s.listingId);
        return { ...s, listing };
      })
    );
    return enriched;
  }),

  /** Submit a review */
  submitReview: protectedProcedure
    .input(
      z.object({
        purchaseId: z.number(),
        rating: z.number().min(1).max(5),
        sellerRating: z.number().min(1).max(5).optional(),
        title: z.string().max(256).optional(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });

      const purchase = await db.getPurchaseById(input.purchaseId);
      if (!purchase) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase not found" });
      if (purchase.buyerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (purchase.hasReviewed) throw new TRPCError({ code: "BAD_REQUEST", message: "Already reviewed" });

      const result = await db.createReview({
        listingId: purchase.listingId,
        purchaseId: purchase.id,
        reviewerId: ctx.user.id,
        rating: input.rating,
        sellerRating: input.sellerRating || null,
        title: input.title || null,
        comment: input.comment || null,
      });

      return { reviewId: result.id };
    }),

  /** Get reviews for a listing */
  getReviews: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .query(async ({ input }) => {
      return db.getReviewsByListing(input.listingId);
    }),

  /** Check if user has purchased a listing */
  hasPurchased: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user?.id) return false;
      const purchase = await db.getPurchaseByBuyerAndListing(ctx.user.id, input.listingId);
      return !!purchase;
    }),

  /** Get seller profile */
  getSellerProfile: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const profile = await db.getSellerProfile(input.userId);
      const stats = await db.getSellerStats(input.userId);
      return { profile, stats };
    }),

  /** Get my seller profile & stats */
  mySellerProfile: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
    const displayName = ctx.user.name || ctx.user.email || "Anonymous Seller";
    const profile = await db.getOrCreateSellerProfile(ctx.user.id, displayName);
    const stats = await db.getSellerStats(ctx.user.id);
    return { profile, stats };
  }),

  /** Update seller profile */
  updateSellerProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(2).max(128).optional(),
        bio: z.string().max(2000).optional(),
        avatarUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
      await db.updateSellerProfile(ctx.user.id, input as any);
      return { success: true };
    }),

  /** Get marketplace stats */
  stats: protectedProcedure.query(async () => {
    const allListings = await db.listMarketplaceListings({ limit: 1000 });
    const categories = [...new Set(allListings.map((l: any) => l.category))];
    const totalSales = allListings.reduce((sum: number, l: any) => sum + l.totalSales, 0);
    return {
      totalListings: allListings.length,
      totalCategories: categories.length,
      totalSales,
      categories: categories.map((c) => ({
        name: c,
        count: allListings.filter((l: any) => l.category === c).length,
      })),
    };
  }),

  /** Admin: approve/reject listing */
  adminReview: protectedProcedure
    .input(
      z.object({
        listingId: z.number(),
        action: z.enum(["approve", "reject", "flag"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id || ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }
      const listing = await db.getListingById(input.listingId);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });

      const reviewStatus = input.action === "approve" ? "approved" as const
        : input.action === "reject" ? "rejected" as const
        : "flagged" as const;

      const status = input.action === "approve" ? "active" as const : "draft" as const;

      await db.updateListing(input.listingId, {
        reviewStatus,
        status,
        reviewNotes: input.notes || listing.reviewNotes,
      });

      return { success: true, reviewStatus, status };
    }),

  /** Admin SQL exec for one-time setup (admin only, dangerous) */
  adminExec: protectedProcedure
    .input(z.object({ statements: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id || ctx.user.role !== "admin") throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin only" });
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
      const results: string[] = [];
      for (const stmt of input.statements) {
        try {
          const safeStmt = safeDDLStatement(stmt);
          const [rows] = await database.execute(sql.raw(safeStmt));
          results.push(`OK: ${JSON.stringify(rows).substring(0, 200)}`);
        } catch (e: unknown) {
          results.push(`ERR: ${getErrorMessage(e)?.substring(0, 150)}`);
        }
      }
      return { results };
    }),

  /** Diagnose marketplace tables (admin only) */
  diagnose: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.id || ctx.user.role !== "admin") throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin only" });
    const database = await getDb();
    if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
    try {
      const [cols] = await database.execute(sql.raw("SHOW COLUMNS FROM marketplace_listings"));
      const [count] = await database.execute(sql.raw("SELECT COUNT(*) as cnt FROM marketplace_listings"));
      return { columns: cols, count };
    } catch (e: unknown) {
      return { error: getErrorMessage(e) };
    }
  }),

  /** Recreate marketplace tables from scratch (admin only, DESTRUCTIVE) */
  recreateTables: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user?.id || ctx.user.role !== "admin") throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin only" });
    const database = await getDb();
    if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
    const drops = [
      "DROP TABLE IF EXISTS `marketplace_reviews`",
      "DROP TABLE IF EXISTS `marketplace_purchases`",
      "DROP TABLE IF EXISTS `marketplace_listings`",
      "DROP TABLE IF EXISTS `seller_profiles`",
    ];
    const results: string[] = [];
    for (const ddl of drops) {
      try { await database.execute(sql.raw(ddl)); results.push(`DROP: OK`); } catch (e: unknown) { results.push(`DROP: ${getErrorMessage(e)?.substring(0, 80)}`); }
    }
    // Now recreate
    const creates = [
      `CREATE TABLE \`seller_profiles\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`displayName\` varchar(128) NOT NULL, \`bio\` text, \`avatarUrl\` text, \`totalSales\` int NOT NULL DEFAULT 0, \`totalRevenue\` int NOT NULL DEFAULT 0, \`avgRating\` int NOT NULL DEFAULT 0, \`ratingCount\` int NOT NULL DEFAULT 0, \`verified\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`seller_profiles_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`seller_profiles_userId_unique\` UNIQUE(\`userId\`))`,
      `CREATE TABLE \`marketplace_listings\` (\`id\` int AUTO_INCREMENT NOT NULL, \`uid\` varchar(64) NOT NULL, \`sellerId\` int NOT NULL, \`title\` varchar(256) NOT NULL, \`slug\` varchar(300) NOT NULL, \`description\` text NOT NULL, \`longDescription\` text, \`category\` enum('agents','modules','blueprints','artifacts','exploits','templates','datasets','other') NOT NULL DEFAULT 'modules', \`riskCategory\` enum('safe','low_risk','medium_risk','high_risk') NOT NULL DEFAULT 'safe', \`reviewStatus\` enum('pending_review','approved','rejected','flagged') NOT NULL DEFAULT 'pending_review', \`reviewNotes\` text, \`status\` enum('draft','active','paused','sold_out','removed') NOT NULL DEFAULT 'draft', \`priceCredits\` int NOT NULL, \`priceUsd\` int NOT NULL DEFAULT 0, \`currency\` varchar(8) NOT NULL DEFAULT 'USD', \`fileUrl\` text, \`fileSize\` int, \`fileType\` varchar(64), \`previewUrl\` text, \`thumbnailUrl\` text, \`demoUrl\` text, \`tags\` text, \`language\` varchar(64), \`license\` varchar(64) DEFAULT 'MIT', \`version\` varchar(32) DEFAULT '1.0.0', \`totalSales\` int NOT NULL DEFAULT 0, \`totalRevenue\` int NOT NULL DEFAULT 0, \`viewCount\` int NOT NULL DEFAULT 0, \`downloadCount\` int NOT NULL DEFAULT 0, \`avgRating\` int NOT NULL DEFAULT 0, \`ratingCount\` int NOT NULL DEFAULT 0, \`featured\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`marketplace_listings_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`marketplace_listings_uid_unique\` UNIQUE(\`uid\`), CONSTRAINT \`marketplace_listings_slug_unique\` UNIQUE(\`slug\`))`,
      `CREATE TABLE \`marketplace_purchases\` (\`id\` int AUTO_INCREMENT NOT NULL, \`uid\` varchar(64) NOT NULL, \`buyerId\` int NOT NULL, \`listingId\` int NOT NULL, \`sellerId\` int NOT NULL, \`priceCredits\` int NOT NULL, \`priceUsd\` int NOT NULL DEFAULT 0, \`status\` enum('completed','refunded','disputed') NOT NULL DEFAULT 'completed', \`downloadCount\` int NOT NULL DEFAULT 0, \`maxDownloads\` int NOT NULL DEFAULT 5, \`downloadToken\` varchar(128), \`hasReviewed\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT (now()), CONSTRAINT \`marketplace_purchases_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`marketplace_purchases_uid_unique\` UNIQUE(\`uid\`))`,
      `CREATE TABLE \`marketplace_reviews\` (\`id\` int AUTO_INCREMENT NOT NULL, \`listingId\` int NOT NULL, \`purchaseId\` int NOT NULL, \`reviewerId\` int NOT NULL, \`rating\` int NOT NULL, \`title\` varchar(256), \`comment\` text, \`sellerRating\` int, \`helpful\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`marketplace_reviews_id\` PRIMARY KEY(\`id\`))`,
    ];
    for (const ddl of creates) {
      try {
        await database.execute(sql.raw(ddl));
        const t = ddl.match(/`(\w+)`/)?.[1] || "?";
        results.push(`CREATE ${t}: OK`);
      } catch (e: unknown) {
        const t = ddl.match(/`(\w+)`/)?.[1] || "?";
        results.push(`CREATE ${t}: ${getErrorMessage(e)?.substring(0, 80)}`);
      }
    }
    return { results };
  }),

  /** Force-create marketplace tables (admin only) */
  forceMigrate: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user?.id || ctx.user.role !== "admin") throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin only" });
    const database = await getDb();
    if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

    const tables = [
      `CREATE TABLE IF NOT EXISTS \`marketplace_listings\` (\`id\` int AUTO_INCREMENT NOT NULL, \`uid\` varchar(64) NOT NULL, \`sellerId\` int NOT NULL, \`title\` varchar(256) NOT NULL, \`slug\` varchar(300) NOT NULL, \`description\` text NOT NULL, \`longDescription\` text, \`category\` enum('agents','modules','blueprints','artifacts','exploits','templates','datasets','other') NOT NULL DEFAULT 'modules', \`riskCategory\` enum('safe','low_risk','medium_risk','high_risk') NOT NULL DEFAULT 'safe', \`reviewStatus\` enum('pending_review','approved','rejected','flagged') NOT NULL DEFAULT 'pending_review', \`reviewNotes\` text, \`status\` enum('draft','active','paused','sold_out','removed') NOT NULL DEFAULT 'draft', \`priceCredits\` int NOT NULL, \`priceUsd\` int NOT NULL DEFAULT 0, \`currency\` varchar(8) NOT NULL DEFAULT 'USD', \`fileUrl\` text, \`fileSize\` int, \`fileType\` varchar(64), \`previewUrl\` text, \`thumbnailUrl\` text, \`demoUrl\` text, \`tags\` text, \`language\` varchar(64), \`license\` varchar(64) DEFAULT 'MIT', \`version\` varchar(32) DEFAULT '1.0.0', \`totalSales\` int NOT NULL DEFAULT 0, \`totalRevenue\` int NOT NULL DEFAULT 0, \`viewCount\` int NOT NULL DEFAULT 0, \`downloadCount\` int NOT NULL DEFAULT 0, \`avgRating\` int NOT NULL DEFAULT 0, \`ratingCount\` int NOT NULL DEFAULT 0, \`featured\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`marketplace_listings_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`marketplace_listings_uid_unique\` UNIQUE(\`uid\`), CONSTRAINT \`marketplace_listings_slug_unique\` UNIQUE(\`slug\`))`,
      `CREATE TABLE IF NOT EXISTS \`marketplace_purchases\` (\`id\` int AUTO_INCREMENT NOT NULL, \`uid\` varchar(64) NOT NULL, \`buyerId\` int NOT NULL, \`listingId\` int NOT NULL, \`sellerId\` int NOT NULL, \`priceCredits\` int NOT NULL, \`priceUsd\` int NOT NULL DEFAULT 0, \`status\` enum('completed','refunded','disputed') NOT NULL DEFAULT 'completed', \`downloadCount\` int NOT NULL DEFAULT 0, \`maxDownloads\` int NOT NULL DEFAULT 5, \`downloadToken\` varchar(128), \`hasReviewed\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT (now()), CONSTRAINT \`marketplace_purchases_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`marketplace_purchases_uid_unique\` UNIQUE(\`uid\`))`,
      `CREATE TABLE IF NOT EXISTS \`marketplace_reviews\` (\`id\` int AUTO_INCREMENT NOT NULL, \`listingId\` int NOT NULL, \`purchaseId\` int NOT NULL, \`reviewerId\` int NOT NULL, \`rating\` int NOT NULL, \`title\` varchar(256), \`comment\` text, \`sellerRating\` int, \`helpful\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`marketplace_reviews_id\` PRIMARY KEY(\`id\`))`,
      `CREATE TABLE IF NOT EXISTS \`seller_profiles\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`displayName\` varchar(128) NOT NULL, \`bio\` text, \`avatarUrl\` text, \`totalSales\` int NOT NULL DEFAULT 0, \`totalRevenue\` int NOT NULL DEFAULT 0, \`avgRating\` int NOT NULL DEFAULT 0, \`ratingCount\` int NOT NULL DEFAULT 0, \`verified\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`seller_profiles_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`seller_profiles_userId_unique\` UNIQUE(\`userId\`))`,
    ];
    const results: string[] = [];
    for (const ddl of tables) {
      try {
        await database.execute(sql.raw(ddl));
        const tableName = ddl.match(/`(\w+)`/)?.[1] || "unknown";
        results.push(`${tableName}: OK`);
      } catch (e: unknown) {
        const tableName = ddl.match(/`(\w+)`/)?.[1] || "unknown";
        results.push(`${tableName}: ${getErrorMessage(e)?.substring(0, 100)}`);
      }
    }
    return { tables: results };
  }),

  // ─── PREMIUM MARKETPLACE FEATURES (Revenue Generation) ──────────────

  /** Feature a listing — costs 500 credits, gets premium placement for 30 days */
  featureListing: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
      const FEATURE_COST = 500;
      const listing = await db.getListingById(input.listingId);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
      if (listing.sellerId !== ctx.user.id && ctx.user.role !== "admin")
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't own this listing" });
      if (listing.featured) throw new TRPCError({ code: "BAD_REQUEST", message: "Already featured" });
      const balance = await getCreditBalance(ctx.user.id);
      if (balance.credits < FEATURE_COST && !balance.isUnlimited)
        throw new TRPCError({ code: "BAD_REQUEST", message: `Need ${FEATURE_COST} credits to feature. You have ${balance.credits}.` });
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { creditBalances, creditTransactions, marketplaceListings } = await import("../drizzle/schema");
      const { eq, sql: sqlOp } = await import("drizzle-orm");
      if (!balance.isUnlimited) {
        await dbInstance.update(creditBalances).set({
          credits: sqlOp`${creditBalances.credits} - ${FEATURE_COST}`,
          lifetimeCreditsUsed: sqlOp`${creditBalances.lifetimeCreditsUsed} + ${FEATURE_COST}`,
        }).where(eq(creditBalances.userId, ctx.user.id));
        const updatedBal = await dbInstance.select({ credits: creditBalances.credits }).from(creditBalances).where(eq(creditBalances.userId, ctx.user.id)).limit(1);
        await dbInstance.insert(creditTransactions).values({
          userId: ctx.user.id,
          amount: -FEATURE_COST,
          type: "marketplace_feature",
          description: `Featured listing "${listing.title}" for 30 days`,
          balanceAfter: updatedBal[0]?.credits ?? 0,
        });
      }
      await dbInstance.update(marketplaceListings).set({ featured: true }).where(eq(marketplaceListings.id, input.listingId));
      return { success: true, cost: FEATURE_COST, message: "Listing featured for 30 days" };
    }),

  /** Boost a listing — costs 200 credits, increases visibility for 7 days */
  boostListing: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
      const BOOST_COST = 200;
      const listing = await db.getListingById(input.listingId);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
      if (listing.sellerId !== ctx.user.id && ctx.user.role !== "admin")
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't own this listing" });
      const balance = await getCreditBalance(ctx.user.id);
      if (balance.credits < BOOST_COST && !balance.isUnlimited)
        throw new TRPCError({ code: "BAD_REQUEST", message: `Need ${BOOST_COST} credits to boost. You have ${balance.credits}.` });
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { creditBalances, creditTransactions, marketplaceListings } = await import("../drizzle/schema");
      const { eq, sql: sqlOp } = await import("drizzle-orm");
      if (!balance.isUnlimited) {
        await dbInstance.update(creditBalances).set({
          credits: sqlOp`${creditBalances.credits} - ${BOOST_COST}`,
          lifetimeCreditsUsed: sqlOp`${creditBalances.lifetimeCreditsUsed} + ${BOOST_COST}`,
        }).where(eq(creditBalances.userId, ctx.user.id));
        const updatedBal = await dbInstance.select({ credits: creditBalances.credits }).from(creditBalances).where(eq(creditBalances.userId, ctx.user.id)).limit(1);
        await dbInstance.insert(creditTransactions).values({
          userId: ctx.user.id,
          amount: -BOOST_COST,
          type: "marketplace_boost",
          description: `Boosted listing "${listing.title}" for 7 days`,
          balanceAfter: updatedBal[0]?.credits ?? 0,
        });
      }
      await dbInstance.update(marketplaceListings).set({
        viewCount: sqlOp`${marketplaceListings.viewCount} + 100`,
      }).where(eq(marketplaceListings.id, input.listingId));
      return { success: true, cost: BOOST_COST, message: "Listing boosted for 7 days" };
    }),

  /** Verify seller — costs 1000 credits, gets verified badge permanently */
  verifySeller: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
      const VERIFY_COST = 1000;
      const profile = await db.getSellerProfile(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Create a seller profile first" });
      if (profile.verified) throw new TRPCError({ code: "BAD_REQUEST", message: "Already verified" });
      const balance = await getCreditBalance(ctx.user.id);
      if (balance.credits < VERIFY_COST && !balance.isUnlimited)
        throw new TRPCError({ code: "BAD_REQUEST", message: `Need ${VERIFY_COST} credits for verification. You have ${balance.credits}.` });
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { creditBalances, creditTransactions } = await import("../drizzle/schema");
      const { eq, sql: sqlOp } = await import("drizzle-orm");
      if (!balance.isUnlimited) {
        await dbInstance.update(creditBalances).set({
          credits: sqlOp`${creditBalances.credits} - ${VERIFY_COST}`,
          lifetimeCreditsUsed: sqlOp`${creditBalances.lifetimeCreditsUsed} + ${VERIFY_COST}`,
        }).where(eq(creditBalances.userId, ctx.user.id));
        const updatedBal = await dbInstance.select({ credits: creditBalances.credits }).from(creditBalances).where(eq(creditBalances.userId, ctx.user.id)).limit(1);
        await dbInstance.insert(creditTransactions).values({
          userId: ctx.user.id,
          amount: -VERIFY_COST,
          type: "marketplace_verification",
          description: "Seller verification badge — permanent",
          balanceAfter: updatedBal[0]?.credits ?? 0,
        });
      }
      await db.updateSellerProfile(ctx.user.id, { verified: true });
      return { success: true, cost: VERIFY_COST, message: "Seller verified! Badge applied permanently." };
    }),

  /** Get premium pricing info */
  premiumPricing: publicProcedure.query(() => {
    return {
      sellerRegistration: { cost: SELLER_ANNUAL_FEE_CREDITS, costUsd: "$12", duration: "1 year", description: "Annual seller registration — required to list items on the Bazaar" },
      platformCommission: { rate: `${PLATFORM_COMMISSION_RATE * 100}%`, description: "Platform takes 8% commission on every sale. Sellers receive 92%." },
      featureListing: { cost: 500, duration: "30 days", description: "Premium placement at top of marketplace" },
      boostListing: { cost: 200, duration: "7 days", description: "Increased visibility and view count boost" },
      sellerVerification: { cost: 1000, duration: "Permanent", description: "Verified seller badge — builds trust and increases sales" },
    };
  }),

  // ═══════════════════════════════════════════════════════════════════
  // SELLER PAYOUT METHODS
  // ═══════════════════════════════════════════════════════════════════

  /** Get all payout methods for the current seller */
  getPayoutMethods: protectedProcedure.query(async ({ ctx }) => {
    const database = await getDb();
    if (!database || !ctx.user?.id) return [];
    const { sellerPayoutMethods } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    return database.select().from(sellerPayoutMethods).where(eq(sellerPayoutMethods.userId, ctx.user.id));
  }),

  /** Add a new payout method */
  addPayoutMethod: protectedProcedure
    .input(z.object({
      methodType: z.enum(["bank_transfer", "paypal", "stripe_connect"]),
      label: z.string().max(128).optional(),
      // Bank transfer fields
      bankBsb: z.string().max(16).optional(),
      bankAccountNumber: z.string().max(32).optional(),
      bankAccountName: z.string().max(128).optional(),
      bankName: z.string().max(128).optional(),
      bankCountry: z.string().max(64).optional(),
      bankSwiftBic: z.string().max(16).optional(),
      // PayPal fields
      paypalEmail: z.string().email().max(320).optional(),
      // Stripe Connect (account ID created server-side)
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database || !ctx.user?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const { sellerProfiles, sellerPayoutMethods } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");

      // Verify user is a seller
      const profiles = await database.select().from(sellerProfiles).where(eq(sellerProfiles.userId, ctx.user.id)).limit(1);
      if (profiles.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "You must be a registered seller to add payout methods" });
      const seller = profiles[0];

      // Validate required fields per method type
      if (input.methodType === "bank_transfer") {
        if (!input.bankBsb || !input.bankAccountNumber || !input.bankAccountName) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "BSB, account number, and account name are required for bank transfer" });
        }
      } else if (input.methodType === "paypal") {
        if (!input.paypalEmail) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "PayPal email is required" });
        }
      }

      // If setting as default, unset other defaults first
      if (input.isDefault) {
        await database.update(sellerPayoutMethods)
          .set({ isDefault: false })
          .where(eq(sellerPayoutMethods.userId, ctx.user.id));
      }

      // Check if this is the first payout method (auto-set as default)
      const existing = await database.select().from(sellerPayoutMethods).where(eq(sellerPayoutMethods.userId, ctx.user.id));
      const shouldBeDefault = existing.length === 0 || input.isDefault;

      // For Stripe Connect, create a connected account
      let stripeConnectAccountId: string | undefined;
      if (input.methodType === "stripe_connect") {
        try {
          const Stripe = (await import("stripe")).default;
          const stripeKey = process.env.STRIPE_SECRET_KEY;
          if (!stripeKey) throw new Error("Stripe not configured");
          const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" as any });
          const account = await stripe.accounts.create({
            type: "express",
            email: ctx.user.email || undefined,
            capabilities: {
              transfers: { requested: true },
            },
            metadata: {
              userId: String(ctx.user.id),
              sellerId: String(seller.id),
              platform: "archibald-titan",
            },
          });
          stripeConnectAccountId = account.id;
        } catch (err: unknown) {
          log.error("[Payout] Stripe Connect account creation failed:", { error: String(getErrorMessage(err)) });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create Stripe Connect account: " + getErrorMessage(err) });
        }
      }

      const [result] = await database.insert(sellerPayoutMethods).values({
        sellerId: seller.id,
        userId: ctx.user.id,
        methodType: input.methodType,
        isDefault: shouldBeDefault,
        label: input.label || (input.methodType === "bank_transfer" ? `${input.bankName || "Bank"} - ${input.bankBsb}` : input.methodType === "paypal" ? input.paypalEmail : "Stripe Connect"),
        bankBsb: input.bankBsb || null,
        bankAccountNumber: input.bankAccountNumber || null,
        bankAccountName: input.bankAccountName || null,
        bankName: input.bankName || null,
        bankCountry: input.bankCountry || null,
        bankSwiftBic: input.bankSwiftBic || null,
        paypalEmail: input.paypalEmail || null,
        stripeConnectAccountId: stripeConnectAccountId || null,
        stripeConnectOnboarded: false,
        verified: false,
        status: "pending_verification",
      });

      // If Stripe Connect, generate onboarding link
      let onboardingUrl: string | null = null;
      if (input.methodType === "stripe_connect" && stripeConnectAccountId) {
        try {
          const Stripe = (await import("stripe")).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-04-10" as any });
          const siteUrl = process.env.SITE_URL || "https://www.archibaldtitan.com";
          const accountLink = await stripe.accountLinks.create({
            account: stripeConnectAccountId,
            refresh_url: `${siteUrl}/marketplace/sell?stripe_refresh=true`,
            return_url: `${siteUrl}/marketplace/sell?stripe_onboarded=true`,
            type: "account_onboarding",
          });
          onboardingUrl = accountLink.url;
        } catch (err: unknown) {
          log.warn("[Payout] Stripe onboarding link failed:", { error: String(getErrorMessage(err)) });
        }
      }

      return {
        success: true,
        methodId: (result as any).insertId,
        methodType: input.methodType,
        isDefault: shouldBeDefault,
        onboardingUrl,
        message: input.methodType === "stripe_connect"
          ? "Stripe Connect account created. Complete onboarding to start receiving payouts."
          : "Payout method added successfully. It will be verified shortly.",
      };
    }),

  /** Update a payout method */
  updatePayoutMethod: protectedProcedure
    .input(z.object({
      id: z.number(),
      label: z.string().max(128).optional(),
      bankBsb: z.string().max(16).optional(),
      bankAccountNumber: z.string().max(32).optional(),
      bankAccountName: z.string().max(128).optional(),
      bankName: z.string().max(128).optional(),
      bankCountry: z.string().max(64).optional(),
      bankSwiftBic: z.string().max(16).optional(),
      paypalEmail: z.string().email().max(320).optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database || !ctx.user?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const { sellerPayoutMethods } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");

      // Verify ownership
      const methods = await database.select().from(sellerPayoutMethods)
        .where(and(eq(sellerPayoutMethods.id, input.id), eq(sellerPayoutMethods.userId, ctx.user.id)))
        .limit(1);
      if (methods.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Payout method not found" });

      // If setting as default, unset others
      if (input.isDefault) {
        await database.update(sellerPayoutMethods)
          .set({ isDefault: false })
          .where(eq(sellerPayoutMethods.userId, ctx.user.id));
      }

      const updateData: any = {};
      if (input.label !== undefined) updateData.label = input.label;
      if (input.bankBsb !== undefined) updateData.bankBsb = input.bankBsb;
      if (input.bankAccountNumber !== undefined) updateData.bankAccountNumber = input.bankAccountNumber;
      if (input.bankAccountName !== undefined) updateData.bankAccountName = input.bankAccountName;
      if (input.bankName !== undefined) updateData.bankName = input.bankName;
      if (input.bankCountry !== undefined) updateData.bankCountry = input.bankCountry;
      if (input.bankSwiftBic !== undefined) updateData.bankSwiftBic = input.bankSwiftBic;
      if (input.paypalEmail !== undefined) updateData.paypalEmail = input.paypalEmail;
      if (input.isDefault !== undefined) updateData.isDefault = input.isDefault;

      await database.update(sellerPayoutMethods).set(updateData)
        .where(and(eq(sellerPayoutMethods.id, input.id), eq(sellerPayoutMethods.userId, ctx.user.id)));

      return { success: true };
    }),

  /** Delete a payout method */
  deletePayoutMethod: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database || !ctx.user?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const { sellerPayoutMethods } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");

      await database.delete(sellerPayoutMethods)
        .where(and(eq(sellerPayoutMethods.id, input.id), eq(sellerPayoutMethods.userId, ctx.user.id)));

      return { success: true };
    }),

  /** Get Stripe Connect onboarding link (for incomplete onboarding) */
  getStripeOnboardingLink: protectedProcedure
    .input(z.object({ payoutMethodId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database || !ctx.user?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const { sellerPayoutMethods } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");

      const methods = await database.select().from(sellerPayoutMethods)
        .where(and(eq(sellerPayoutMethods.id, input.payoutMethodId), eq(sellerPayoutMethods.userId, ctx.user.id)))
        .limit(1);
      if (methods.length === 0 || !methods[0].stripeConnectAccountId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Stripe Connect payout method not found" });
      }

      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-04-10" as any });
      const siteUrl = process.env.SITE_URL || "https://www.archibaldtitan.com";
      const accountLink = await stripe.accountLinks.create({
        account: methods[0].stripeConnectAccountId,
        refresh_url: `${siteUrl}/marketplace/sell?stripe_refresh=true`,
        return_url: `${siteUrl}/marketplace/sell?stripe_onboarded=true`,
        type: "account_onboarding",
      });

      return { url: accountLink.url };
    }),

  // ═══════════════════════════════════════════════════════════════════
  // ADMIN FILE RECOVERY
  // ═══════════════════════════════════════════════════════════════════

  /** Admin-only: List all uploaded files for a specific user (for recovery) */
  adminListUserFiles: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user?.id || ctx.user.role !== "admin") throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin only" });
      const database = await getDb();
      if (!database) return { users: [], files: [] };

      const { marketplaceListings, sellerProfiles, users } = await import("../drizzle/schema");
      const { eq, isNotNull } = await import("drizzle-orm");

      if (input.userId) {
        // Get all listings with files for a specific user
        const profiles = await database.select().from(sellerProfiles).where(eq(sellerProfiles.userId, input.userId)).limit(1);
        if (profiles.length === 0) return { users: [], files: [] };
        const listings = await database.select().from(marketplaceListings)
          .where(eq(marketplaceListings.sellerId, profiles[0].id));
        return {
          users: [],
          files: listings.filter(l => l.fileUrl).map(l => ({
            listingId: l.id,
            uid: l.uid,
            title: l.title,
            fileUrl: l.fileUrl,
            fileSize: l.fileSize,
            fileType: l.fileType,
            status: l.status,
            createdAt: l.createdAt,
            s3Path: `marketplace/users/${input.userId}/${l.uid}/`,
            backupPath: `backups/users/${input.userId}/marketplace/${l.uid}/`,
          })),
        };
      }

      // List all sellers with file counts
      const allProfiles = await database.select().from(sellerProfiles);
      const userFiles = [];
      for (const profile of allProfiles) {
        const listings = await database.select().from(marketplaceListings)
          .where(eq(marketplaceListings.sellerId, profile.id));
        const filesCount = listings.filter(l => l.fileUrl).length;
        if (filesCount > 0) {
          userFiles.push({
            userId: profile.userId,
            sellerId: profile.id,
            displayName: profile.displayName,
            totalListings: listings.length,
            totalFiles: filesCount,
            s3BasePath: `marketplace/users/${profile.userId}/`,
            backupBasePath: `backups/users/${profile.userId}/marketplace/`,
          });
        }
      }
      return { users: userFiles, files: [] };
    }),

  /** Seed marketplace with merchant bots and professional module catalog */
  seed: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user?.id || ctx.user.role !== "admin") throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin only" });

    // Step 1: Force-create tables first
    const database = await getDb();
    if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
    const tableDDLs = [
      `CREATE TABLE IF NOT EXISTS \`marketplace_listings\` (\`id\` int AUTO_INCREMENT NOT NULL, \`uid\` varchar(64) NOT NULL, \`sellerId\` int NOT NULL, \`title\` varchar(256) NOT NULL, \`slug\` varchar(300) NOT NULL, \`description\` text NOT NULL, \`longDescription\` text, \`category\` enum('agents','modules','blueprints','artifacts','exploits','templates','datasets','other') NOT NULL DEFAULT 'modules', \`riskCategory\` enum('safe','low_risk','medium_risk','high_risk') NOT NULL DEFAULT 'safe', \`reviewStatus\` enum('pending_review','approved','rejected','flagged') NOT NULL DEFAULT 'pending_review', \`reviewNotes\` text, \`status\` enum('draft','active','paused','sold_out','removed') NOT NULL DEFAULT 'draft', \`priceCredits\` int NOT NULL, \`priceUsd\` int NOT NULL DEFAULT 0, \`currency\` varchar(8) NOT NULL DEFAULT 'USD', \`fileUrl\` text, \`fileSize\` int, \`fileType\` varchar(64), \`previewUrl\` text, \`thumbnailUrl\` text, \`demoUrl\` text, \`tags\` text, \`language\` varchar(64), \`license\` varchar(64) DEFAULT 'MIT', \`version\` varchar(32) DEFAULT '1.0.0', \`totalSales\` int NOT NULL DEFAULT 0, \`totalRevenue\` int NOT NULL DEFAULT 0, \`viewCount\` int NOT NULL DEFAULT 0, \`downloadCount\` int NOT NULL DEFAULT 0, \`avgRating\` int NOT NULL DEFAULT 0, \`ratingCount\` int NOT NULL DEFAULT 0, \`featured\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`marketplace_listings_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`marketplace_listings_uid_unique\` UNIQUE(\`uid\`), CONSTRAINT \`marketplace_listings_slug_unique\` UNIQUE(\`slug\`))`,
      `CREATE TABLE IF NOT EXISTS \`seller_profiles\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`displayName\` varchar(128) NOT NULL, \`bio\` text, \`avatarUrl\` text, \`totalSales\` int NOT NULL DEFAULT 0, \`totalRevenue\` int NOT NULL DEFAULT 0, \`avgRating\` int NOT NULL DEFAULT 0, \`ratingCount\` int NOT NULL DEFAULT 0, \`verified\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`seller_profiles_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`seller_profiles_userId_unique\` UNIQUE(\`userId\`))`,
      `CREATE TABLE IF NOT EXISTS \`marketplace_purchases\` (\`id\` int AUTO_INCREMENT NOT NULL, \`uid\` varchar(64) NOT NULL, \`buyerId\` int NOT NULL, \`listingId\` int NOT NULL, \`sellerId\` int NOT NULL, \`priceCredits\` int NOT NULL, \`priceUsd\` int NOT NULL DEFAULT 0, \`status\` enum('completed','refunded','disputed') NOT NULL DEFAULT 'completed', \`downloadCount\` int NOT NULL DEFAULT 0, \`maxDownloads\` int NOT NULL DEFAULT 5, \`downloadToken\` varchar(128), \`hasReviewed\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT (now()), CONSTRAINT \`marketplace_purchases_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`marketplace_purchases_uid_unique\` UNIQUE(\`uid\`))`,
      `CREATE TABLE IF NOT EXISTS \`marketplace_reviews\` (\`id\` int AUTO_INCREMENT NOT NULL, \`listingId\` int NOT NULL, \`purchaseId\` int NOT NULL, \`reviewerId\` int NOT NULL, \`rating\` int NOT NULL, \`title\` varchar(256), \`comment\` text, \`sellerRating\` int, \`helpful\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`marketplace_reviews_id\` PRIMARY KEY(\`id\`))`,
    ];
    for (const ddl of tableDDLs) {
      try { await database.execute(sql.raw(ddl)); } catch (e: unknown) { log.warn("[Seed] Table DDL:", { error: String(getErrorMessage(e)?.substring(0, 100)) }); }
    }

    // Step 2: Seed data
    try {
      const result = await seedMarketplaceWithMerchants();
      return result;
    } catch (e: unknown) {
      log.error("[Marketplace] Seed failed:", { error: String(getErrorMessage(e)) });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Seed failed: " + getErrorMessage(e) });
    }
  }),
});

// Old seed data removed — now using marketplace-seed.ts with merchant bots
