import { eq, and, or, gte, lte, like, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";
import { InsertUser, users, companies, InsertCompany, businessPlans, InsertBusinessPlan, grantOpportunities, InsertGrantOpportunity, grantApplications, InsertGrantApplication, grantMatches, InsertGrantMatch, crowdfundingCampaigns, InsertCrowdfundingCampaign, crowdfundingRewards, InsertCrowdfundingReward, crowdfundingContributions, InsertCrowdfundingContribution, crowdfundingUpdates, InsertCrowdfundingUpdate, marketplaceListings, InsertMarketplaceListing, marketplacePurchases, InsertMarketplacePurchase, marketplaceReviews, InsertMarketplaceReview, sellerProfiles, InsertSellerProfile, sellerPayoutMethods, InsertSellerPayoutMethod } from "../drizzle/schema";
import { ENV } from './_core/env';
import { createLogger } from "./_core/logger.js";
const log = createLogger("Database");
let _db: ReturnType<typeof drizzle> | null = null;
let _pool: ReturnType<typeof createPool> | null = null;
// Lazily create the drizzle instance with a connection pool for resilience.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 10,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
      });
      _db = drizzle(_pool);
    } catch (error) {
      log.warn("[Database] Failed to connect:", { error: String(error) });
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    log.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    } else if (ENV.ownerEmails && user.email && ENV.ownerEmails.includes(user.email.toLowerCase())) {
      // Auto-promote owner by email match
      values.role = 'admin';
      updateSet.role = 'admin';
      log.info(`[Database] Auto-promoted user to admin by email match: ${user.email}`);
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });

    // Increment loginCount separately — safe to fail if column doesn't exist yet
    try {
      await db.update(users).set({ loginCount: sql`COALESCE(loginCount, 0) + 1` } as any).where(eq(users.openId, user.openId!));
    } catch (_) {
      // Column may not exist pre-migration — silently ignore
    }
  } catch (error) {
    log.error("[Database] Failed to upsert user:", { error: String(error) });
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    log.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==========================================
// GRANT FINDER DB FUNCTIONS
// ==========================================

// --- Company functions ---
export async function createCompany(data: InsertCompany) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(companies).values(data);
  return { id: result[0].insertId };
}
export async function getCompaniesByUser(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(companies).where(eq(companies.userId, userId));
}
export async function getCompanyById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(companies).where(eq(companies.id, id));
  return result[0];
}
export async function updateCompany(id: number, data: Partial<InsertCompany>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(companies).set(data).where(eq(companies.id, id));
}
export async function deleteCompany(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(companies).where(eq(companies.id, id));
}

// --- Business Plan functions ---
export async function createBusinessPlan(data: InsertBusinessPlan) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(businessPlans).values(data);
  return { id: result[0].insertId };
}
export async function getBusinessPlansByCompany(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(businessPlans).where(eq(businessPlans.companyId, companyId)).orderBy(desc(businessPlans.createdAt));
}
export async function getBusinessPlanById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(businessPlans).where(eq(businessPlans.id, id));
  return result[0];
}
export async function updateBusinessPlan(id: number, data: Partial<InsertBusinessPlan>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(businessPlans).set(data).where(eq(businessPlans.id, id));
}

// --- Grant Opportunity functions ---
export async function listGrantOpportunities(filters?: { region?: string; agency?: string; minAmount?: number; maxAmount?: number; status?: string; search?: string; country?: string; industryTag?: string; limit?: number }) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (filters?.region) conditions.push(eq(grantOpportunities.region, filters.region));
  if (filters?.agency) conditions.push(eq(grantOpportunities.agency, filters.agency));
  if (filters?.minAmount) conditions.push(gte(grantOpportunities.maxAmount, filters.minAmount));
  if (filters?.maxAmount) conditions.push(lte(grantOpportunities.minAmount, filters.maxAmount));
  if (filters?.status) conditions.push(eq(grantOpportunities.status, filters.status as any));
  if (filters?.search) conditions.push(like(grantOpportunities.title, `%${filters.search}%`));
  if (filters?.country) conditions.push(or(like(grantOpportunities.country, `%${filters.country}%`), like(grantOpportunities.applicableCountries, `%${filters.country}%`), eq(grantOpportunities.applicableCountries, 'ALL')));
  if (filters?.industryTag) conditions.push(like(grantOpportunities.industryTags, `%${filters.industryTag.toLowerCase()}%`));
  const query = conditions.length > 0
    ? db.select().from(grantOpportunities).where(and(...conditions)).orderBy(desc(grantOpportunities.createdAt))
    : db.select().from(grantOpportunities).orderBy(desc(grantOpportunities.createdAt));
  if (filters?.limit) return (query as any).limit(filters.limit);
  return query;
}
export async function getGrantOpportunityById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(grantOpportunities).where(eq(grantOpportunities.id, id));
  return result[0];
}
export async function createGrantOpportunity(data: InsertGrantOpportunity) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(grantOpportunities).values(data);
  return { id: result[0].insertId };
}
export async function updateGrantOpportunity(id: number, data: Partial<InsertGrantOpportunity>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(grantOpportunities).set(data).where(eq(grantOpportunities.id, id));
}
export async function seedGrantOpportunities(grants: InsertGrantOpportunity[]) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  for (const grant of grants) {
    await db.insert(grantOpportunities).values(grant);
  }
  return { count: grants.length };
}

// --- Grant Application functions ---
export async function createGrantApplication(data: InsertGrantApplication) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(grantApplications).values(data);
  return { id: result[0].insertId };
}
export async function getGrantApplicationsByCompany(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(grantApplications).where(eq(grantApplications.companyId, companyId)).orderBy(desc(grantApplications.createdAt));
}
export async function getGrantApplicationById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(grantApplications).where(eq(grantApplications.id, id));
  return result[0];
}
export async function updateGrantApplication(id: number, data: Partial<InsertGrantApplication>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(grantApplications).set(data).where(eq(grantApplications.id, id));
}

// --- Grant Match functions ---
export async function createGrantMatch(data: InsertGrantMatch) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(grantMatches).values(data);
  return { id: result[0].insertId };
}
export async function getGrantMatchesByCompany(companyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(grantMatches).where(eq(grantMatches.companyId, companyId)).orderBy(desc(grantMatches.matchScore));
}

// --- Crowdfunding Campaign functions ---
export async function createCampaign(data: InsertCrowdfundingCampaign) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(crowdfundingCampaigns).values(data);
  return { id: result[0].insertId };
}
export async function listCampaigns(filters?: { status?: string; category?: string; userId?: number }) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (filters?.status) conditions.push(eq(crowdfundingCampaigns.status, filters.status as any));
  if (filters?.category) conditions.push(eq(crowdfundingCampaigns.category, filters.category));
  if (filters?.userId) conditions.push(eq(crowdfundingCampaigns.userId, filters.userId));
  if (conditions.length > 0) {
    return db.select().from(crowdfundingCampaigns).where(and(...conditions)).orderBy(desc(crowdfundingCampaigns.createdAt));
  }
  return db.select().from(crowdfundingCampaigns).orderBy(desc(crowdfundingCampaigns.createdAt));
}
export async function getCampaignById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(crowdfundingCampaigns).where(eq(crowdfundingCampaigns.id, id));
  return result[0];
}
export async function getCampaignBySlug(slug: string) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(crowdfundingCampaigns).where(eq(crowdfundingCampaigns.slug, slug));
  return result[0];
}
export async function updateCampaign(id: number, data: Partial<InsertCrowdfundingCampaign>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(crowdfundingCampaigns).set(data).where(eq(crowdfundingCampaigns.id, id));
}

// --- Crowdfunding Rewards ---
export async function createReward(data: InsertCrowdfundingReward) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(crowdfundingRewards).values(data);
  return { id: result[0].insertId };
}
export async function getRewardsByCampaign(campaignId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(crowdfundingRewards).where(eq(crowdfundingRewards.campaignId, campaignId));
}

// --- Crowdfunding Contributions ---
export async function createContribution(data: InsertCrowdfundingContribution) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(crowdfundingContributions).values(data);
  // Update campaign totals
  await db.update(crowdfundingCampaigns).set({
    currentAmount: sql`${crowdfundingCampaigns.currentAmount} + ${data.amount}`,
    backerCount: sql`${crowdfundingCampaigns.backerCount} + 1`,
  }).where(eq(crowdfundingCampaigns.id, data.campaignId));
  return { id: result[0].insertId };
}
export async function getContributionsByCampaign(campaignId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(crowdfundingContributions).where(eq(crowdfundingContributions.campaignId, campaignId)).orderBy(desc(crowdfundingContributions.createdAt));
}

// --- Crowdfunding Updates ---
export async function createCampaignUpdate(data: InsertCrowdfundingUpdate) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(crowdfundingUpdates).values(data);
  return { id: result[0].insertId };
}
export async function getUpdatesByCampaign(campaignId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(crowdfundingUpdates).where(eq(crowdfundingUpdates.campaignId, campaignId)).orderBy(desc(crowdfundingUpdates.createdAt));
}

// ==========================================
// MARKETPLACE DB FUNCTIONS
// ==========================================

// --- Marketplace Listing functions ---
export async function createListing(data: InsertMarketplaceListing) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(marketplaceListings).values(data);
  return { id: result[0].insertId };
}
export async function listMarketplaceListings(filters?: { category?: string; status?: string; sellerId?: number; search?: string; riskCategory?: string; featured?: boolean; sortBy?: string; limit?: number; offset?: number }) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (filters?.category) conditions.push(eq(marketplaceListings.category, filters.category as any));
  if (filters?.status) conditions.push(eq(marketplaceListings.status, filters.status as any));
  if (filters?.sellerId) conditions.push(eq(marketplaceListings.sellerId, filters.sellerId));
  if (filters?.search) conditions.push(or(like(marketplaceListings.title, `%${filters.search}%`), like(marketplaceListings.description, `%${filters.search}%`), like(marketplaceListings.tags, `%${filters.search}%`)));
  if (filters?.riskCategory) conditions.push(eq(marketplaceListings.riskCategory, filters.riskCategory as any));
  if (filters?.featured) conditions.push(eq(marketplaceListings.featured, true));
  // Default: only show approved+active listings for browse
  if (!filters?.sellerId) {
    conditions.push(eq(marketplaceListings.reviewStatus, "approved"));
    if (!filters?.status) conditions.push(eq(marketplaceListings.status, "active"));
  }
  const orderCol = filters?.sortBy === "price_asc" ? marketplaceListings.priceCredits
    : filters?.sortBy === "price_desc" ? marketplaceListings.priceCredits
    : filters?.sortBy === "rating" ? marketplaceListings.avgRating
    : filters?.sortBy === "sales" ? marketplaceListings.totalSales
    : marketplaceListings.createdAt;
  const orderDir = filters?.sortBy === "price_asc" ? sql`ASC` : desc(orderCol);
  const query = conditions.length > 0
    ? db.select().from(marketplaceListings).where(and(...conditions))
    : db.select().from(marketplaceListings);
  // Apply ordering and pagination
  const results = await (query as any).orderBy(filters?.sortBy === "price_asc" ? marketplaceListings.priceCredits : desc(orderCol)).limit(filters?.limit || 50).offset(filters?.offset || 0);
  return results;
}
export async function getListingById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(marketplaceListings).where(eq(marketplaceListings.id, id));
  return result[0];
}
export async function getListingBySlug(slug: string) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(marketplaceListings).where(eq(marketplaceListings.slug, slug));
  return result[0];
}
export async function getListingByUid(uid: string) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(marketplaceListings).where(eq(marketplaceListings.uid, uid));
  return result[0];
}
export async function updateListing(id: number, data: Partial<InsertMarketplaceListing>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(marketplaceListings).set(data).where(eq(marketplaceListings.id, id));
}
export async function deleteListing(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(marketplaceListings).where(eq(marketplaceListings.id, id));
}
export async function incrementListingViews(id: number) {
  const db = await getDb(); if (!db) return;
  await db.update(marketplaceListings).set({ viewCount: sql`${marketplaceListings.viewCount} + 1` }).where(eq(marketplaceListings.id, id));
}

// --- Marketplace Purchase functions ---
export async function createPurchase(data: InsertMarketplacePurchase) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(marketplacePurchases).values(data);
  // Update listing sales count
  await db.update(marketplaceListings).set({
    totalSales: sql`${marketplaceListings.totalSales} + 1`,
    totalRevenue: sql`${marketplaceListings.totalRevenue} + ${data.priceCredits}`,
  }).where(eq(marketplaceListings.id, data.listingId));
  return { id: result[0].insertId };
}
export async function getPurchasesByBuyer(buyerId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(marketplacePurchases).where(eq(marketplacePurchases.buyerId, buyerId)).orderBy(desc(marketplacePurchases.createdAt));
}
export async function getPurchasesBySeller(sellerId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(marketplacePurchases).where(eq(marketplacePurchases.sellerId, sellerId)).orderBy(desc(marketplacePurchases.createdAt));
}
export async function getPurchaseById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(marketplacePurchases).where(eq(marketplacePurchases.id, id));
  return result[0];
}
export async function getPurchaseByBuyerAndListing(buyerId: number, listingId: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(marketplacePurchases).where(and(eq(marketplacePurchases.buyerId, buyerId), eq(marketplacePurchases.listingId, listingId)));
  return result[0];
}
export async function updatePurchase(id: number, data: Partial<InsertMarketplacePurchase>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(marketplacePurchases).set(data).where(eq(marketplacePurchases.id, id));
}

// --- Marketplace Review functions ---
export async function createReview(data: InsertMarketplaceReview) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(marketplaceReviews).values(data);
  // Update listing average rating
  const reviews = await db.select().from(marketplaceReviews).where(eq(marketplaceReviews.listingId, data.listingId));
  const avgRating = Math.round(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length * 100);
  await db.update(marketplaceListings).set({ avgRating, ratingCount: reviews.length }).where(eq(marketplaceListings.id, data.listingId));
  // Mark purchase as reviewed
  await db.update(marketplacePurchases).set({ hasReviewed: true }).where(eq(marketplacePurchases.id, data.purchaseId));
  // Update seller profile rating if sellerRating provided
  if (data.sellerRating) {
    const listing = await db.select().from(marketplaceListings).where(eq(marketplaceListings.id, data.listingId)).limit(1);
    if (listing[0]) {
      const sellerReviews = await db.select().from(marketplaceReviews)
        .where(and(sql`${marketplaceReviews.sellerRating} IS NOT NULL`));
      // Filter to this seller's listings
      const sellerListings = await db.select().from(marketplaceListings).where(eq(marketplaceListings.sellerId, listing[0].sellerId));
      const sellerListingIds = sellerListings.map(l => l.id);
      const relevantReviews = sellerReviews.filter(r => sellerListingIds.includes(r.listingId));
      if (relevantReviews.length > 0) {
        const sellerAvg = Math.round(relevantReviews.reduce((sum, r) => sum + (r.sellerRating || 0), 0) / relevantReviews.length * 100);
        await db.update(sellerProfiles).set({ avgRating: sellerAvg, ratingCount: relevantReviews.length }).where(eq(sellerProfiles.userId, listing[0].sellerId));
      }
    }
  }
  return { id: result[0].insertId };
}
export async function getReviewsByListing(listingId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(marketplaceReviews).where(eq(marketplaceReviews.listingId, listingId)).orderBy(desc(marketplaceReviews.createdAt));
}

// --- Seller Profile functions ---
export async function getOrCreateSellerProfile(userId: number, displayName: string) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const existing = await db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const result = await db.insert(sellerProfiles).values({ userId, displayName });
  const created = await db.select().from(sellerProfiles).where(eq(sellerProfiles.id, result[0].insertId)).limit(1);
  return created[0];
}
export async function getSellerProfile(userId: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId)).limit(1);
  return result[0];
}
export async function updateSellerProfile(userId: number, data: Partial<InsertSellerProfile>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(sellerProfiles).set(data).where(eq(sellerProfiles.userId, userId));
}
export async function getSellerStats(userId: number) {
  const db = await getDb(); if (!db) return { totalSales: 0, totalRevenue: 0, totalListings: 0, avgRating: 0, ratingCount: 0 };
  const listings = await db.select().from(marketplaceListings).where(eq(marketplaceListings.sellerId, userId));
  const purchases = await db.select().from(marketplacePurchases).where(eq(marketplacePurchases.sellerId, userId));
  const totalSales = purchases.length;
  const totalRevenue = purchases.reduce((sum, p) => sum + p.priceCredits, 0);
  const profile = await getSellerProfile(userId);
  return {
    totalSales,
    totalRevenue,
    totalListings: listings.length,
    activeListings: listings.filter(l => l.status === "active" && l.reviewStatus === "approved").length,
    avgRating: profile?.avgRating || 0,
    ratingCount: profile?.ratingCount || 0,
  };
}
