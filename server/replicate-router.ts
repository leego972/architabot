/**
 * Website Replicate Router — tRPC endpoints for the Website Replicate feature
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
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
      })
    )
    .mutation(async ({ input, ctx }) => {
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
      });
      return project;
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
   * Delete a replicate project
   */
  delete: protectedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const deleted = await deleteProject(input.projectId, ctx.user.id);
      return { success: deleted };
    }),
});
