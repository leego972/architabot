import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { getUserOpenAIKey } from "./user-secrets-router";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { refreshGrantsForCountry, refreshAllGrants, getSupportedCountries } from "./grant-refresh-service";
import { seedExternalCampaigns, getSourceStats } from "./crowdfunding-aggregator";
import {
  isBinancePayConfigured,
  generateMerchantTradeNo,
  calculatePlatformFee,
  createCryptoPaymentOrder,
  queryOrderStatus,
  getFallbackCryptoInfo,
  PLATFORM_FEE_PERCENT,
  SUPPORTED_CRYPTO,
} from "./binance-pay-service";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
const log = createLogger("GrantFinderRouter");

// ==========================================
// NO MORE FAKE SEED DATA
// All grants come from real government APIs
// ==========================================

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function extractSection(text: string, sectionName: string): string {
  const patterns = [
    new RegExp(`##\\s*${sectionName}[\\s\\S]*?(?=##\\s|$)`, 'i'),
    new RegExp(`\\*\\*${sectionName}\\*\\*[\\s\\S]*?(?=\\*\\*|$)`, 'i'),
    new RegExp(`${sectionName}:\\s*([\\s\\S]*?)(?=\\n\\n|$)`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].replace(/^##\s*\w+\s*/, '').trim();
  }
  return '';
}

// ==========================================
// ROUTERS
// ==========================================

export const companyRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getCompaniesByUser(ctx.user.id);
  }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getCompanyById(input.id);
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    industry: z.string().optional(),
    technologyArea: z.string().optional(),
    employeeCount: z.number().optional(),
    annualRevenue: z.number().optional(),
    foundedYear: z.number().optional(),
    location: z.string().optional(),
    minorityOwned: z.number().optional(),
    womenOwned: z.number().optional(),
    veteranOwned: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    return db.createCompany({ ...input, userId: ctx.user.id });
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    industry: z.string().optional(),
    technologyArea: z.string().optional(),
    employeeCount: z.number().optional(),
    annualRevenue: z.number().optional(),
    foundedYear: z.number().optional(),
    location: z.string().optional(),
    minorityOwned: z.number().optional(),
    womenOwned: z.number().optional(),
    veteranOwned: z.number().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await db.updateCompany(id, data);
    return { success: true };
  }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.deleteCompany(input.id);
    return { success: true };
  }),
});

export const businessPlanRouter = router({
  list: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    return db.getBusinessPlansByCompany(input.companyId);
  }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getBusinessPlanById(input.id);
  }),
  generate: protectedProcedure.input(z.object({
    companyId: z.number(),
    projectTitle: z.string(),
    projectDescription: z.string(),
    targetMarket: z.string().optional(),
    competitiveAdvantage: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const company = await db.getCompanyById(input.companyId);
    if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
    const userApiKey = await getUserOpenAIKey(ctx.user.id) || undefined;

    const prompt = `Generate a comprehensive business plan for a grant application.

Company: ${company.name}
Industry: ${company.industry || 'Not specified'}
Technology Area: ${company.technologyArea || 'Not specified'}
Employees: ${company.employeeCount || 'Not specified'}
Annual Revenue: ${company.annualRevenue ? '$' + company.annualRevenue.toLocaleString() : 'Not specified'}
Location: ${company.location || 'Not specified'}

Project: ${input.projectTitle}
Description: ${input.projectDescription}
Target Market: ${input.targetMarket || 'Not specified'}
Competitive Advantage: ${input.competitiveAdvantage || 'Not specified'}

Generate the following sections with detailed, professional content:
## Executive Summary
## Technology Description
## Market Analysis
## Competitive Analysis
## Team Qualifications
## Research Plan
## Commercialization Strategy
## Financial Projections
## IP Strategy`;

    const response = await invokeLLM({
      systemTag: "misc",
      userApiKey,
      model: "fast", messages: [{ role: "user", content: prompt }] });
    const content = String(response.choices[0]?.message?.content || '');

    const plan = {
      companyId: input.companyId,
      title: input.projectTitle,
      executiveSummary: extractSection(content, 'Executive Summary') || content.substring(0, 500),
      technologyDescription: extractSection(content, 'Technology Description'),
      marketAnalysis: extractSection(content, 'Market Analysis'),
      competitiveAnalysis: extractSection(content, 'Competitive Analysis'),
      teamQualifications: extractSection(content, 'Team Qualifications'),
      researchPlan: extractSection(content, 'Research Plan'),
      commercializationStrategy: extractSection(content, 'Commercialization Strategy'),
      financialProjections: extractSection(content, 'Financial Projections'),
      ipStrategy: extractSection(content, 'IP Strategy'),
      status: "completed" as const,
    };

    return db.createBusinessPlan(plan);
  }),
});

export const grantRouter = router({
  list: publicProcedure.input(z.object({
    region: z.string().optional(),
    agency: z.string().optional(),
    minAmount: z.number().optional(),
    maxAmount: z.number().optional(),
    status: z.string().optional(),
    search: z.string().optional(),
  }).optional()).query(async ({ input }) => {
    return db.listGrantOpportunities(input || {});
  }),
  get: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getGrantOpportunityById(input.id);
  }),
  match: protectedProcedure.input(z.object({ companyId: z.number() })).mutation(async ({ input, ctx }) => {
    const company = await db.getCompanyById(input.companyId);
    if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
    const userApiKey = await getUserOpenAIKey(ctx.user.id) || undefined;

    const grants = await db.listGrantOpportunities();
    const prompt = `Analyze this company and score each grant opportunity for fit.

Company: ${company.name}
Industry: ${company.industry || 'General'}
Technology: ${company.technologyArea || 'General'}
Employees: ${company.employeeCount || 'Unknown'}
Revenue: ${company.annualRevenue || 'Unknown'}
Location: ${company.location || 'Unknown'}
Minority-owned: ${company.minorityOwned ? 'Yes' : 'No'}
Women-owned: ${company.womenOwned ? 'Yes' : 'No'}
Veteran-owned: ${company.veteranOwned ? 'Yes' : 'No'}

For each grant, provide a JSON array with objects containing:
- grantId (number)
- matchScore (0-100)
- eligibilityScore (0-100)
- alignmentScore (0-100)
- competitivenessScore (0-100)
- reason (string)
- successProbability (0-100)

Grants:
${grants.map((g: any) => `ID:${g.id} - ${g.agency} ${g.programName}: ${g.title} (${g.region}, $${g.minAmount}-$${g.maxAmount})`).join('\n')}

Return ONLY a JSON array, no other text.`;

    const response = await invokeLLM({
      systemTag: "misc",
      userApiKey,
      model: "fast",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_schema", json_schema: { name: "grant_matches", strict: true, schema: { type: "object", properties: { matches: { type: "array", items: { type: "object", properties: { grantId: { type: "number" }, matchScore: { type: "number" }, eligibilityScore: { type: "number" }, alignmentScore: { type: "number" }, competitivenessScore: { type: "number" }, reason: { type: "string" }, successProbability: { type: "number" } }, required: ["grantId", "matchScore", "eligibilityScore", "alignmentScore", "competitivenessScore", "reason", "successProbability"], additionalProperties: false } } }, required: ["matches"], additionalProperties: false } } },
    });

    const content = String(response.choices[0]?.message?.content || '{"matches":[]}');
    let matches: any[] = [];
    try {
      const parsed = JSON.parse(content);
      matches = parsed.matches || parsed;
    } catch { matches = []; }

    const results = [];
    for (const m of matches) {
      if (m.matchScore > 30) {
        const result = await db.createGrantMatch({
          companyId: input.companyId,
          grantOpportunityId: m.grantId,
          matchScore: m.matchScore,
          eligibilityScore: m.eligibilityScore,
          alignmentScore: m.alignmentScore,
          competitivenessScore: m.competitivenessScore,
          recommendationReason: m.reason,
          estimatedSuccessProbability: m.successProbability,
          isRecommended: m.matchScore >= 70 ? 1 : 0,
        });
        results.push(result);
      }
    }
    return { matchCount: results.length, matches };
  }),
  matches: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    return db.getGrantMatchesByCompany(input.companyId);
  }),
});

export const grantApplicationRouter = router({
  list: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    return db.getGrantApplicationsByCompany(input.companyId);
  }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getGrantApplicationById(input.id);
  }),
  generate: protectedProcedure.input(z.object({
    companyId: z.number(),
    grantOpportunityId: z.number(),
    businessPlanId: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const company = await db.getCompanyById(input.companyId);
    if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
    const userApiKey = await getUserOpenAIKey(ctx.user.id) || undefined;
    const grant = await db.getGrantOpportunityById(input.grantOpportunityId);
    if (!grant) throw new TRPCError({ code: "NOT_FOUND", message: "Grant not found" });

    let businessPlanContext = '';
    if (input.businessPlanId) {
      const plan = await db.getBusinessPlanById(input.businessPlanId);
      if (plan) {
        businessPlanContext = `\nBusiness Plan: ${plan.title}\nExecutive Summary: ${plan.executiveSummary}\nTechnology: ${plan.technologyDescription}\nMarket: ${plan.marketAnalysis}`;
      }
    }

    const prompt = `Generate a complete grant application for the following:

Company: ${company.name} (${company.industry || 'General'})
Technology: ${company.technologyArea || 'General'}
Location: ${company.location || 'Not specified'}
${businessPlanContext}

Grant: ${grant.agency} - ${grant.programName}
Title: ${grant.title}
Description: ${grant.description}
Focus Areas: ${grant.focusAreas}
Amount: $${grant.minAmount?.toLocaleString()} - $${grant.maxAmount?.toLocaleString()}
Eligibility: ${grant.eligibilityCriteria}

Generate these sections:
## Technical Abstract
## Project Description
## Specific Aims
## Innovation
## Approach
## Commercialization Plan
## Budget (estimated breakdown)
## Budget Justification
## Timeline

Also provide:
- Success Probability (0-100)
- Quality Score (0-100)
- Priority ranking (1-10, 1 being highest)`;

    const response = await invokeLLM({
      systemTag: "misc",
      userApiKey,
      model: "fast", messages: [{ role: "user", content: prompt }] });
    const content = String(response.choices[0]?.message?.content || '');

    const successMatch = content.match(/Success Probability[:\s]*(\d+)/i);
    const qualityMatch = content.match(/Quality Score[:\s]*(\d+)/i);
    const priorityMatch = content.match(/Priority[:\s]*(\d+)/i);

    const application = {
      companyId: input.companyId,
      grantOpportunityId: input.grantOpportunityId,
      businessPlanId: input.businessPlanId || null,
      technicalAbstract: extractSection(content, 'Technical Abstract'),
      projectDescription: extractSection(content, 'Project Description'),
      specificAims: extractSection(content, 'Specific Aims'),
      innovation: extractSection(content, 'Innovation'),
      approach: extractSection(content, 'Approach'),
      commercializationPlan: extractSection(content, 'Commercialization Plan'),
      budget: extractSection(content, 'Budget'),
      budgetJustification: extractSection(content, 'Budget Justification'),
      timeline: extractSection(content, 'Timeline'),
      successProbability: successMatch ? parseInt(successMatch[1]) : 50,
      qualityScore: qualityMatch ? parseInt(qualityMatch[1]) : 50,
      priority: priorityMatch ? parseInt(priorityMatch[1]) : 5,
      expectedValue: grant.maxAmount ? Math.round((grant.maxAmount * (successMatch ? parseInt(successMatch[1]) : 50)) / 100) : 0,
      status: "draft" as const,
    };

    return db.createGrantApplication(application);
  }),
  updateStatus: protectedProcedure.input(z.object({
    id: z.number(),
    status: z.enum(["draft", "ready", "submitted", "under_review", "awarded", "rejected"]),
  })).mutation(async ({ input }) => {
    await db.updateGrantApplication(input.id, { status: input.status });
    return { success: true };
  }),
});

export const grantSeedRouter = router({
  seed: protectedProcedure.mutation(async () => {
    // Instead of fake seeds, fetch real grants from government APIs
    const result = await refreshAllGrants();
    return { success: true, count: result.totalDiscovered + result.totalUpdated };
  }),
  count: publicProcedure.query(async () => {
    const grants = await db.listGrantOpportunities();
    return { count: grants.length };
  }),
});

export const grantRefreshRouter = router({
  supportedCountries: publicProcedure.query(() => {
    return getSupportedCountries();
  }),
  refreshCountry: protectedProcedure.input(z.object({
    countryCode: z.string(),
    industryFilter: z.string().optional(),
  })).mutation(async ({ input }) => {
    return refreshGrantsForCountry(input.countryCode, input.industryFilter);
  }),
  refreshAll: protectedProcedure.input(z.object({
    industryFilter: z.string().optional(),
  }).optional()).mutation(async ({ input }) => {
    return refreshAllGrants(input?.industryFilter);
  }),
});

export const crowdfundingRouter = router({
  /** List all campaigns with optional filters — supports hybrid (internal + external) */
  list: publicProcedure.input(z.object({
    status: z.string().optional(),
    category: z.string().optional(),
    source: z.string().optional(),
    search: z.string().optional(),
    sort: z.enum(["newest", "most_funded", "ending_soon", "most_backed", "trending"]).optional(),
  }).optional()).query(async ({ input }) => {
    const campaigns = await db.listCampaigns(input || {});
    let filtered = campaigns;

    // Filter by source platform
    if (input?.source && input.source !== "all") {
      filtered = filtered.filter((c: any) => c.source === input.source);
    }

    // Search filter
    if (input?.search) {
      const q = input.search.toLowerCase();
      filtered = filtered.filter((c: any) =>
        c.title.toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q) ||
        (c.creatorName || "").toLowerCase().includes(q) ||
        (c.location || "").toLowerCase().includes(q)
      );
    }

    // Sort
    if (input?.sort) {
      switch (input.sort) {
        case "most_funded":
          filtered.sort((a: any, b: any) => (b.percentFunded || 0) - (a.percentFunded || 0));
          break;
        case "ending_soon":
          filtered.sort((a: any, b: any) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
          break;
        case "most_backed":
          filtered.sort((a: any, b: any) => (b.backerCount || 0) - (a.backerCount || 0));
          break;
        case "trending":
          filtered.sort((a: any, b: any) => (b.percentFunded || 0) - (a.percentFunded || 0));
          break;
        case "newest":
        default:
          // Already sorted by createdAt desc from DB
          break;
      }
    }

    return filtered;
  }),

  /** Get a single campaign with all details */
  get: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const campaign = await db.getCampaignById(input.id);
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
    const rewards = await db.getRewardsByCampaign(input.id);
    const contributions = await db.getContributionsByCampaign(input.id);
    const updates = await db.getUpdatesByCampaign(input.id);
    return { ...campaign, rewards, contributions, updates };
  }),

  /** Get by slug for public shareable URLs */
  getBySlug: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
    const campaign = await db.getCampaignBySlug(input.slug);
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
    const rewards = await db.getRewardsByCampaign(campaign.id);
    const contributions = await db.getContributionsByCampaign(campaign.id);
    const updates = await db.getUpdatesByCampaign(campaign.id);
    return { ...campaign, rewards, contributions, updates };
  }),

  /** Get platform-wide stats */
  stats: publicProcedure.query(async () => {
    const campaigns = await db.listCampaigns();
    return getSourceStats(campaigns);
  }),

  /** Create a new internal campaign */
  create: protectedProcedure.input(z.object({
    title: z.string().min(1),
    description: z.string().default(""),
    story: z.string().optional(),
    category: z.string().default("technology"),
    subcategory: z.string().optional(),
    goalAmount: z.number().min(100),
    currency: z.string().default("USD"),
    imageUrl: z.string().optional(),
    videoUrl: z.string().optional(),
    startDate: z.string(),
    endDate: z.string(),
    companyId: z.number().optional(),
    tags: z.array(z.string()).optional(),
  })).mutation(async ({ ctx, input }) => {
    const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
    return db.createCampaign({
      ...input,
      slug,
      userId: ctx.user.id,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      status: "draft",
      source: "internal",
      creatorName: ctx.user.name || "Anonymous",
      location: "",
      percentFunded: 0,
    });
  }),

  /** Update a campaign (owner only for internal, admin for external) */
  update: protectedProcedure.input(z.object({
    id: z.number(),
    title: z.string().optional(),
    description: z.string().optional(),
    story: z.string().optional(),
    status: z.enum(["draft", "active", "funded", "ended", "cancelled"]).optional(),
    imageUrl: z.string().optional(),
    videoUrl: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const campaign = await db.getCampaignById(input.id);
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
    // Only owner or admin can update
    if (campaign.userId !== ctx.user.id && ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
    }
    const { id, ...data } = input;
    await db.updateCampaign(id, data);
    return { success: true };
  }),

  /** Add reward tier to a campaign */
  addReward: protectedProcedure.input(z.object({
    campaignId: z.number(),
    title: z.string().min(1),
    description: z.string().optional(),
    minAmount: z.number().min(1),
    maxClaims: z.number().optional(),
    estimatedDelivery: z.string().optional(),
  })).mutation(async ({ input }) => {
    return db.createReward({
      ...input,
      estimatedDelivery: input.estimatedDelivery ? new Date(input.estimatedDelivery) : undefined,
    });
  }),

  /** Contribute to an internal campaign (records contribution, updates totals) */
  contribute: protectedProcedure.input(z.object({
    campaignId: z.number(),
    amount: z.number().min(1),
    message: z.string().optional(),
    anonymous: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    // Verify campaign exists and is internal + active
    const campaign = await db.getCampaignById(input.campaignId);
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
    if ((campaign as any).source !== "internal") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "External campaigns must be funded on their original platform" });
    }
    if (campaign.status !== "active") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Campaign is not accepting contributions" });
    }

    const result = await db.createContribution({
      campaignId: input.campaignId,
      userId: ctx.user.id,
      amount: input.amount,
      status: "completed",
      backerName: ctx.user.name || "Anonymous",
      backerEmail: ctx.user.email || "",
      message: input.message,
      anonymous: input.anonymous || 0,
    });

    // Update percent funded
    const updated = await db.getCampaignById(input.campaignId);
    if (updated) {
      const pct = Math.round((updated.currentAmount / updated.goalAmount) * 100);
      await db.updateCampaign(input.campaignId, { percentFunded: pct } as any);
    }

    return result;
  }),

  /** Post an update to a campaign */
  addUpdate: protectedProcedure.input(z.object({
    campaignId: z.number(),
    title: z.string().min(1),
    content: z.string().min(1),
  })).mutation(async ({ input }) => {
    return db.createCampaignUpdate(input);
  }),

  /** Get rewards for a campaign */
  rewards: publicProcedure.input(z.object({ campaignId: z.number() })).query(async ({ input }) => {
    return db.getRewardsByCampaign(input.campaignId);
  }),

  /** Get contributions for a campaign */
  contributions: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ input }) => {
    return db.getContributionsByCampaign(input.campaignId);
  }),

  /** Get updates for a campaign */
  updates: publicProcedure.input(z.object({ campaignId: z.number() })).query(async ({ input }) => {
    return db.getUpdatesByCampaign(input.campaignId);
  }),

  /** Seed external campaigns from aggregator */
  seed: protectedProcedure.mutation(async () => {
    const result = await seedExternalCampaigns(db.createCampaign, db.listCampaigns);
    return result;
  }),

  /** Get user's own campaigns */
  myCampaigns: protectedProcedure.query(async ({ ctx }) => {
    return db.listCampaigns({ userId: ctx.user.id });
  }),

  /** Get crypto payment configuration info */
  cryptoConfig: publicProcedure.query(async () => {
    const configured = isBinancePayConfigured();
    return {
      configured,
      supportedCurrencies: [...SUPPORTED_CRYPTO],
      platformFeePercent: PLATFORM_FEE_PERCENT,
      fallback: configured ? null : getFallbackCryptoInfo(),
    };
  }),

  /** Create a crypto payment order via Binance Pay */
  createCryptoPayment: protectedProcedure.input(z.object({
    campaignId: z.number(),
    amount: z.number().min(1),
    currency: z.string().default("USD"),
    donorName: z.string().optional(),
    donorEmail: z.string().optional(),
    donorMessage: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    // Verify campaign exists and is internal + active
    const campaign = await db.getCampaignById(input.campaignId);
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
    if ((campaign as any).source !== "internal") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Crypto payments only available for internal campaigns" });
    }
    if (campaign.status !== "active") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Campaign is not accepting contributions" });
    }

    // Calculate platform fee
    const { platformFee, creatorAmount } = calculatePlatformFee(input.amount);
    const merchantTradeNo = generateMerchantTradeNo();

    // Determine base URL for callbacks
    const baseUrl = process.env.APP_URL || "https://www.archibaldtitan.com";

    if (!isBinancePayConfigured()) {
      // Return fallback wallet info for manual crypto transfer
      const fallback = getFallbackCryptoInfo();
      // Still record the payment intent in DB
      try {
        const { getDb } = await import("./db.js");
        const { cryptoPayments } = await import("../drizzle/schema.js");
        const dbConn = await getDb();
        if (dbConn) {
          await dbConn.insert(cryptoPayments).values({
            userId: ctx.user.id,
            campaignId: input.campaignId,
            merchantTradeNo,
            status: "awaiting_manual",
            fiatAmount: input.amount.toFixed(2),
            fiatCurrency: input.currency,
            platformFee: platformFee.toFixed(2),
            creatorAmount: creatorAmount.toFixed(2),
            donorName: input.donorName || ctx.user.name || "Anonymous",
            donorEmail: input.donorEmail || ctx.user.email || "",
            donorMessage: input.donorMessage,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          });
        }
      } catch (err) {
        log.error("Failed to record manual crypto payment:", { error: String(err) });
      }
      return {
        type: "manual" as const,
        merchantTradeNo,
        walletAddresses: fallback.walletAddresses,
        instructions: fallback.instructions,
        amount: input.amount,
        platformFee,
        creatorAmount,
      };
    }

    // Create Binance Pay order
    try {
      const order = await createCryptoPaymentOrder({
        merchantTradeNo,
        fiatAmount: input.amount,
        fiatCurrency: input.currency,
        goodsName: `Contribution to: ${campaign.title}`,
        goodsDetail: `Crowdfunding contribution for campaign #${campaign.id}`,
        returnUrl: `${baseUrl}/crowdfunding/campaign/${campaign.id}?payment=success`,
        cancelUrl: `${baseUrl}/crowdfunding/campaign/${campaign.id}?payment=cancelled`,
        webhookUrl: `${baseUrl}/api/webhooks/binance-pay`,
        supportPayCurrency: "USDT,BTC,ETH,BNB",
        passThroughInfo: JSON.stringify({
          campaignId: input.campaignId,
          userId: ctx.user.id,
          donorName: input.donorName || ctx.user.name,
          donorMessage: input.donorMessage,
        }),
      });

      // Record in DB
      try {
        const { getDb } = await import("./db.js");
        const { cryptoPayments } = await import("../drizzle/schema.js");
        const dbConn = await getDb();
        if (dbConn) {
          await dbConn.insert(cryptoPayments).values({
            userId: ctx.user.id,
            campaignId: input.campaignId,
            merchantTradeNo,
            binancePrepayId: order.data.prepayId,
            status: "pending",
            fiatAmount: input.amount.toFixed(2),
            fiatCurrency: input.currency,
            platformFee: platformFee.toFixed(2),
            creatorAmount: creatorAmount.toFixed(2),
            checkoutUrl: order.data.checkoutUrl,
            qrcodeLink: order.data.qrcodeLink,
            donorName: input.donorName || ctx.user.name || "Anonymous",
            donorEmail: input.donorEmail || ctx.user.email || "",
            donorMessage: input.donorMessage,
            expiresAt: new Date(order.data.expireTime),
          });
        }
      } catch (err) {
        log.error("Failed to record crypto payment:", { error: String(err) });
      }

      return {
        type: "binance_pay" as const,
        merchantTradeNo,
        checkoutUrl: order.data.checkoutUrl,
        qrcodeLink: order.data.qrcodeLink,
        qrContent: order.data.qrContent,
        universalUrl: order.data.universalUrl,
        expireTime: order.data.expireTime,
        amount: input.amount,
        platformFee,
        creatorAmount,
      };
    } catch (error: unknown) {
      log.error("Binance Pay order creation failed:", { error: String(error) });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Crypto payment failed: ${getErrorMessage(error)}`,
      });
    }
  }),

  /** Check crypto payment status */
  checkCryptoPayment: protectedProcedure.input(z.object({
    merchantTradeNo: z.string(),
  })).query(async ({ input }) => {
    try {
      const { getDb } = await import("./db.js");
      const { cryptoPayments } = await import("../drizzle/schema.js");
      const { eq } = await import("drizzle-orm");
      const dbConn = await getDb();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [payment] = await dbConn.select().from(cryptoPayments)
        .where(eq(cryptoPayments.merchantTradeNo, input.merchantTradeNo));

      if (!payment) throw new TRPCError({ code: "NOT_FOUND" });

      // If pending and Binance Pay is configured, also check with Binance
      if (payment.status === "pending" && isBinancePayConfigured()) {
        try {
          const binanceStatus = await queryOrderStatus(input.merchantTradeNo);
          if (binanceStatus?.data?.status === "PAID") {
            // Update our DB
            await dbConn.update(cryptoPayments)
              .set({ status: "completed", paidAt: new Date(), webhookData: JSON.stringify(binanceStatus.data) })
              .where(eq(cryptoPayments.merchantTradeNo, input.merchantTradeNo));
            return { ...payment, status: "completed" };
          }
        } catch (err) {
          // Ignore query errors, return DB status
        }
      }

      return payment;
    } catch (error: unknown) {
      if ((error as any).code === "NOT_FOUND") throw error;
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: getErrorMessage(error) });
    }
  }),

  /** Get platform revenue stats (admin only) */
  revenueStats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    try {
      const { getDb } = await import("./db.js");
      const { cryptoPayments, platformRevenue } = await import("../drizzle/schema.js");
      const { eq, sql } = await import("drizzle-orm");
      const dbConn = await getDb();
      if (!dbConn) return { totalRevenue: 0, totalFees: 0, totalPayments: 0, completedPayments: 0 };

      const payments = await dbConn.select().from(cryptoPayments);
      const completed = payments.filter((p: any) => p.status === "completed");
      const totalFees = completed.reduce((sum: number, p: any) => sum + parseFloat(p.platformFee || "0"), 0);
      const totalAmount = completed.reduce((sum: number, p: any) => sum + parseFloat(p.fiatAmount || "0"), 0);

      return {
        totalRevenue: totalAmount,
        totalFees,
        totalPayments: payments.length,
        completedPayments: completed.length,
        pendingPayments: payments.filter((p: any) => p.status === "pending").length,
      };
    } catch {
      return { totalRevenue: 0, totalFees: 0, totalPayments: 0, completedPayments: 0 };
    }
  }),
});
