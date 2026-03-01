/**
 * Website Replicate Router — tRPC endpoints for the Website Replicate feature
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import { canUseCloneWebsite } from "./subscription-gate";
import { consumeCredits } from "./credit-service";
import { enforceCloneSafety, checkScrapedContent } from "./clone-safety";
import { detectCloneComplexity, type CloneComplexity } from "../shared/pricing";
import { searchDomains, getDomainPrice, purchaseDomain, configureDNS } from "./domain-service";
import { deployProject, getDeploymentStatus, selectPlatform } from "./deploy-service";
import { getErrorMessage } from "./_core/errors.js";
import { getUserOpenAIKey, getUserGithubPat } from "./user-secrets-router";
import {
  validateExternalUrl,
  checkUserRateLimit,
  logSecurityEvent,
} from "./security-hardening";
import {
  createProject,
  getProject,
  listProjects,
  deleteProject,
  researchTarget,
  generateBuildPlan,
  executeBuild,
  updateBranding,
  updateStripeConfig,
  pushToGithub,
} from "./replicate-engine";

export const replicateRouter = router({
  /**
   * List all replicate projects for the current user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return listProjects(ctx.user.id);
  }),

  /**
   * Get a specific replicate project
   */
  get: protectedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const project = await getProject(input.projectId, ctx.user.id);
      if (!project) throw new Error("Project not found");
      return project;
    }),

  /**
   * Create a new replicate project and start research
   */
  create: protectedProcedure
    .input(
      z.object({
        targetUrl: z.string().min(1),
        targetName: z.string().min(1),
        priority: z.enum(["mvp", "full"]).optional(),
        brandName: z.string().optional(),
        brandColors: z
          .object({
            primary: z.string(),
            secondary: z.string(),
            accent: z.string(),
            background: z.string(),
            text: z.string(),
          })
          .optional(),
        brandLogo: z.string().optional(),
        brandTagline: z.string().optional(),
        stripePublishableKey: z.string().optional(),
        stripeSecretKey: z.string().optional(),
        githubPat: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // ═══ REQUIRED API KEYS: Pull from vault or use per-project input ═══
      // Users must have their own API keys saved — the platform does not subsidize API costs.

      // 1. OpenAI API Key — required for all LLM calls (research, planning, building)
      const userOpenAIKey = await getUserOpenAIKey(ctx.user.id);
      if (!userOpenAIKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An OpenAI API key is required to use Clone Website. Please save your OpenAI API key in Settings → API Keys before cloning.",
        });
      }

      // 2. GitHub PAT — required for pushing to GitHub
      // Priority: per-project input > vault saved key
      let resolvedGithubPat = input.githubPat?.trim() || null;
      if (!resolvedGithubPat || resolvedGithubPat.length < 10) {
        resolvedGithubPat = await getUserGithubPat(ctx.user.id);
      }
      if (!resolvedGithubPat || resolvedGithubPat.length < 10) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A GitHub Personal Access Token is required for Clone Website. Please save your GitHub PAT in Settings → API Keys, or provide one in the clone form.",
        });
      }

      // Validate GitHub PAT against GitHub API and check required scopes
      try {
        const ghRes = await fetch("https://api.github.com/user", {
          headers: { Authorization: `token ${resolvedGithubPat}`, Accept: "application/json", "User-Agent": "ArchibaldTitan" },
        });
        if (!ghRes.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid GitHub PAT — the token was rejected by GitHub. Please check it and try again." });
        }
        const scopeHeader = ghRes.headers.get("x-oauth-scopes") || "";
        const scopes = scopeHeader.split(",").map((s: string) => s.trim()).filter(Boolean);
        const hasRepo = scopes.includes("repo");
        const hasWorkflow = scopes.includes("workflow");
        const hasAdminHook = scopes.includes("admin:repo_hook") || scopes.some((s: string) => s.startsWith("admin:"));
        const missing: string[] = [];
        if (!hasRepo) missing.push("repo");
        if (!hasWorkflow) missing.push("workflow");
        if (!hasAdminHook) missing.push("admin:repo_hook");
        if (missing.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `GitHub PAT is missing required scopes: ${missing.join(", ")}. Please create a new PAT with all scopes: repo, workflow, delete_repo, admin:repo_hook`,
          });
        }
      } catch (e: unknown) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not validate GitHub PAT — network error. Please try again." });
      }

      // ═══ SECURITY: SSRF Prevention & Rate Limiting ═══
      const isAdmin = ctx.user.role === "admin";
      const urlCheck = validateExternalUrl(input.targetUrl, isAdmin);
      if (!urlCheck.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: urlCheck.error || "Invalid target URL — internal/private addresses are blocked.",
        });
      }
      const cloneRateCheck = await checkUserRateLimit(ctx.user.id, "clone:create");
      if (!cloneRateCheck.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Clone rate limit exceeded. Please wait ${Math.ceil((cloneRateCheck.retryAfterMs || 300000) / 1000)}s.`,
        });
      }

      // ═══ TIER GATE: Clone Website is Cyber+ and Titan exclusive ═══
      const hasAccess = await canUseCloneWebsite(ctx.user.id);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Clone Website is an exclusive feature available only on Cyber+ and Titan plans.",
        });
      }

      // ═══ SAFETY CHECK: Block prohibited websites ═══
      try {
        enforceCloneSafety(input.targetUrl, input.targetName, isAdmin);
      } catch (e: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: getErrorMessage(e) || "This website cannot be cloned due to safety restrictions.",
        });
      }

      // ═══ PRICING: Clone is billed per-use ($500–$3,500 based on complexity) ═══
      // Complexity is initially set to "simple" and re-evaluated after research.
      // The initial credit hold ensures the user has credits for the base cost.
      try {
        const creditResult = await consumeCredits(ctx.user.id, "clone_action", "Website clone: " + input.targetUrl);
        if (!creditResult.success) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient credits for clone action. You need 50 credits to clone a website." });
        }
      } catch (e: unknown) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: "FORBIDDEN", message: getErrorMessage(e) || "Insufficient credits for clone action" });
      }

      // ═══ CREATE PROJECT ═══
      try {
        const project = await createProject(ctx.user.id, input.targetUrl, input.targetName, {
          priority: input.priority,
          branding: {
            brandName: input.brandName,
            brandColors: input.brandColors,
            brandLogo: input.brandLogo,
            brandTagline: input.brandTagline,
          },
          stripe: {
            publishableKey: input.stripePublishableKey,
            secretKey: input.stripeSecretKey,
          },
          githubPat: resolvedGithubPat,
        });
        return project;
      } catch (e: unknown) {
        const msg = getErrorMessage(e);
        console.error("[Clone] createProject failed:", msg, e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create clone project: ${msg || "Database error. Please try again."}`,
        });
      }
    }),

  /**
   * Run research on the target website
   */
  research: protectedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      return researchTarget(input.projectId, ctx.user.id);
    }),

  /**
   * Generate build plan from research results
   */
  plan: protectedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        features: z.array(z.string()).optional(),
        techStack: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return generateBuildPlan(input.projectId, ctx.user.id, {
        features: input.features,
        techStack: input.techStack,
      });
    }),

  /**
   * Execute the build plan in the sandbox
   */
  build: protectedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      return executeBuild(input.projectId, ctx.user.id);
    }),

  /**
   * Update branding configuration
   */
  updateBranding: protectedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        brandName: z.string().optional(),
        brandColors: z
          .object({
            primary: z.string(),
            secondary: z.string(),
            accent: z.string(),
            background: z.string(),
            text: z.string(),
          })
          .optional(),
        brandLogo: z.string().optional(),
        brandTagline: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await updateBranding(input.projectId, ctx.user.id, {
        brandName: input.brandName,
        brandColors: input.brandColors,
        brandLogo: input.brandLogo,
        brandTagline: input.brandTagline,
      });
      return { success: true };
    }),

  /**
   * Update Stripe configuration
   */
  updateStripe: protectedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        publishableKey: z.string().optional(),
        secretKey: z.string().optional(),
        priceIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await updateStripeConfig(input.projectId, ctx.user.id, {
        publishableKey: input.publishableKey,
        secretKey: input.secretKey,
        priceIds: input.priceIds,
      });
      return { success: true };
    }),

  /**
   * Push built project to GitHub
   */
  pushToGithub: protectedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        repoName: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return pushToGithub(input.projectId, ctx.user.id, input.repoName);
    }),
  /**
   * Search for available domains based on brand name
   */
  searchDomains: protectedProcedure
    .input(z.object({ keyword: z.string().min(1), maxResults: z.number().int().min(1).max(10).optional() }))
    .mutation(async ({ input }) => {
      try {
        const suggestions = await searchDomains(input.keyword, input.maxResults || 3);
        return { success: true, domains: suggestions };
      } catch (err: unknown) {
        return { success: false, domains: [], message: getErrorMessage(err) };
      }
    }),

  /**
   * Get price for a specific domain
   */
  getDomainPrice: protectedProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .query(async ({ input }) => {
      return getDomainPrice(input.domain);
    }),

  /**
   * Purchase a domain via GoDaddy
   */
  purchaseDomain: protectedProcedure
    .input(z.object({
      projectId: z.number().int(),
      domain: z.string().min(1),
      contact: z.object({
        nameFirst: z.string().min(1),
        nameLast: z.string().min(1),
        email: z.string().email(),
        phone: z.string().min(1),
        addressLine1: z.string().min(1),
        city: z.string().min(1),
        state: z.string().min(1),
        postalCode: z.string().min(1),
        country: z.string().length(2),
        organization: z.string().optional(),
      }),
      years: z.number().int().min(1).max(10).optional(),
      privacy: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify project belongs to user
      const project = await getProject(input.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const result = await purchaseDomain(
        input.domain,
        input.contact,
        input.years || 1,
        input.privacy !== false
      );

      return result;
    }),

  /**
   * Deploy project to Vercel or Railway (auto-selected based on complexity)
   */
  deploy: protectedProcedure
    .input(z.object({
      projectId: z.number().int(),
      repoFullName: z.string().min(1),
      customDomain: z.string().optional(),
      platformOverride: z.enum(["vercel", "railway"]).optional(),
      envVars: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const project = await getProject(input.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      // Detect complexity for auto platform selection
      const complexity = (project.researchData as any)?.estimatedComplexity?.toLowerCase() || "standard";
      const cloneComplexity = ["simple", "standard", "advanced", "enterprise"].includes(complexity)
        ? complexity as any
        : "standard";

      // Build env vars including Stripe keys if provided
      const envVars: Record<string, string> = { ...(input.envVars || {}) };
      if (project.stripePublishableKey) {
        envVars.STRIPE_PUBLISHABLE_KEY = project.stripePublishableKey;
      }
      if (project.stripeSecretKey) {
        envVars.STRIPE_SECRET_KEY = project.stripeSecretKey;
      }

      const result = await deployProject(
        input.repoFullName,
        project.targetName || "clone-project",
        cloneComplexity,
        {
          customDomain: input.customDomain,
          envVars,
          platformOverride: input.platformOverride,
        }
      );

      // If custom domain was provided and deployment succeeded, configure DNS
      if (result.success && input.customDomain) {
        try {
          await configureDNS(input.customDomain, result.platform, result.deploymentUrl);
        } catch {
          // DNS config failure is non-critical — user can do it manually
        }
      }

      return result;
    }),

  /**
   * Check deployment status
   */
  deploymentStatus: protectedProcedure
    .input(z.object({
      deploymentId: z.string().min(1),
      platform: z.enum(["vercel", "railway"]),
    }))
    .query(async ({ input }) => {
      return getDeploymentStatus(input.deploymentId, input.platform);
    }),

  /**
   * Delete a replicate project
   */
  delete: protectedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const deleted = await deleteProject(input.projectId, ctx.user.id);
      return { success: deleted };
    }),
});
