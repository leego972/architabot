import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { fetcherRouter } from "./fetcher-router";
import { releasesRouter } from "./releases-router";
import { contactRouter } from "./contact-router";
import { stripeRouter } from "./stripe-router";
import { downloadRouter } from "./download-gate";
import { apiAccessRouter } from "./api-access-router";
import { teamRouter } from "./team-router";
import { auditRouter } from "./audit-router";
import { dashboardRouter } from "./dashboard-router";
import { watchdogRouter, bulkSyncRouter, credentialHistoryRouter } from "./v2-features-router";
import { chatRouter } from "./chat-router";
import { schedulerRouter, recommendationsRouter, healthTrendsRouter } from "./v3-features-router";
import { leakScannerRouter, onboardingRouter, vaultRouter } from "./v4-features-router";
import { webhookRouter, apiAnalyticsRouter } from "./v5-features-router";
import { identityProviderRouter } from "./identity-provider-router";
import { twoFactorRouter } from "./two-factor-router";
import { adminRouter } from "./admin-router";
import { onboardingWizardRouter } from "./onboarding-wizard-router";
import { selfImprovementDashboardRouter } from "./self-improvement-dashboard-router";
import { improvementBacklogRouter } from "./improvement-backlog-router";
import { voiceRouter } from "./voice-router";
import { creditRouter } from "./credit-router";
import { desktopLicenseRouter } from "./desktop-license-router";
import { importRouter } from "./import-router";
import { credentialHealthRouter } from "./credential-health-router";
import { notificationChannelsRouter } from "./notification-channels-router";
import { totpVaultRouter } from "./totp-vault-router";
import { companyRouter, businessPlanRouter, grantRouter, grantApplicationRouter, grantSeedRouter, grantRefreshRouter, crowdfundingRouter } from "./grant-finder-router";
import { sandboxRouter } from "./sandbox-router";
import { replicateRouter } from "./replicate-router";
import { marketingRouter } from "./marketing-router";
import { customProviderRouter } from "./custom-provider-router";
import { affiliateRouter } from "./affiliate-router";
import { seoRouter } from "./seo-router";
import { blogRouter } from "./blog-router";
import { advertisingRouter } from "./advertising-router";
import { userSecretsRouter } from "./user-secrets-router";
import { marketplaceRouter } from "./marketplace-router";
import { siteMonitorRouter } from "./site-monitor-router";
import { securityDashboardRouter } from "./security-dashboard-router";
import { filesRouter } from "./api/files";

export const appRouter = router({
  files: filesRouter,
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  fetcher: fetcherRouter,
  releases: releasesRouter,
  contact: contactRouter,
  stripe: stripeRouter,
  download: downloadRouter,
  apiAccess: apiAccessRouter,
  team: teamRouter,
  audit: auditRouter,
  dashboard: dashboardRouter,
  watchdog: watchdogRouter,
  bulkSync: bulkSyncRouter,
  credentialHistory: credentialHistoryRouter,
  chat: chatRouter,
  scheduler: schedulerRouter,
  recommendations: recommendationsRouter,
  healthTrends: healthTrendsRouter,
  leakScanner: leakScannerRouter,
  onboarding: onboardingRouter,
  vault: vaultRouter,
  webhooks: webhookRouter,
  apiAnalytics: apiAnalyticsRouter,
  identityProviders: identityProviderRouter,
  twoFactor: twoFactorRouter,
  admin: adminRouter,
  onboardingWizard: onboardingWizardRouter,
  selfImprovement: selfImprovementDashboardRouter,
  improvementBacklog: improvementBacklogRouter,
  voice: voiceRouter,
  credits: creditRouter,
  desktopLicense: desktopLicenseRouter,
  import: importRouter,
  credentialHealth: credentialHealthRouter,
  notificationChannels: notificationChannelsRouter,
  totpVault: totpVaultRouter,
  companies: companyRouter,
  businessPlans: businessPlanRouter,
  grants: grantRouter,
  grantApplications: grantApplicationRouter,
  grantSeed: grantSeedRouter,
  grantRefresh: grantRefreshRouter,
  crowdfunding: crowdfundingRouter,
  sandbox: sandboxRouter,
  replicate: replicateRouter,
  marketing: marketingRouter,
  customProviders: customProviderRouter,
  affiliate: affiliateRouter,
  seo: seoRouter,
  blog: blogRouter,
  advertising: advertisingRouter,
  userSecrets: userSecretsRouter,
  marketplace: marketplaceRouter,
  siteMonitor: siteMonitorRouter,
  securityDashboard: securityDashboardRouter,
});

export type AppRouter = typeof appRouter;
