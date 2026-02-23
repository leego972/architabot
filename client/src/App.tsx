import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import FetcherLayout from "./components/FetcherLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { lazy, Suspense } from "react";

// ─── Lazy-loaded pages (code splitting) ──────────────────────────
// Public pages — loaded eagerly since they're entry points
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

// Auth pages — lazy
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage"));
const DesktopLoginPage = lazy(() => import("./pages/DesktopLoginPage"));

// Public pages — lazy
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const BlogPage = lazy(() => import("./pages/BlogPage"));

// Dashboard / Builder — lazy
const ChatPage = lazy(() => import("./pages/ChatPage"));
const FetcherNew = lazy(() => import("./pages/FetcherNew"));
const FetcherJobs = lazy(() => import("./pages/FetcherJobs"));
const FetcherJobDetail = lazy(() => import("./pages/FetcherJobDetail"));
const FetcherCredentials = lazy(() => import("./pages/FetcherCredentials"));
const FetcherExport = lazy(() => import("./pages/FetcherExport"));
const FetcherSettings = lazy(() => import("./pages/FetcherSettings"));
const FetcherKillSwitch = lazy(() => import("./pages/FetcherKillSwitch"));

// Developer Tools — lazy
const ReplicatePage = lazy(() => import("./pages/ReplicatePage"));
const SandboxPage = lazy(() => import("./pages/SandboxPage"));
const SmartFetchPage = lazy(() => import("./pages/SmartFetchPage"));
const MarketplacePage = lazy(() => import("./pages/MarketplacePage"));

// Security — lazy
const WatchdogPage = lazy(() => import("./pages/WatchdogPage"));
const ProviderHealthPage = lazy(() => import("./pages/ProviderHealthPage"));
const HealthTrendsPage = lazy(() => import("./pages/HealthTrendsPage"));
const LeakScannerPage = lazy(() => import("./pages/LeakScannerPage"));
const CredentialHealthPage = lazy(() => import("./pages/CredentialHealthPage"));
const TotpVaultPage = lazy(() => import("./pages/TotpVaultPage"));

// Business & Funding — lazy
const GrantsPage = lazy(() => import("./pages/GrantsPage"));
const GrantDetailPage = lazy(() => import("./pages/GrantDetailPage"));
const GrantApplicationsPage = lazy(() => import("./pages/GrantApplicationsPage"));
const CompaniesPage = lazy(() => import("./pages/CompaniesPage"));
const BusinessPlanPage = lazy(() => import("./pages/BusinessPlanPage"));
const CrowdfundingPage = lazy(() => import("./pages/CrowdfundingPage"));
const ReferralsPage = lazy(() => import("./pages/ReferralsPage"));
const AdvertisingDashboard = lazy(() => import("./pages/AdvertisingDashboard"));
const AffiliateDashboard = lazy(() => import("./pages/AffiliateDashboard"));
const SeoDashboard = lazy(() => import("./pages/SeoDashboard"));
const BlogAdmin = lazy(() => import("./pages/BlogAdmin"));
const MarketingPage = lazy(() => import("./pages/MarketingPage"));

// Account & Settings — lazy
const AccountSettingsPage = lazy(() => import("./pages/AccountSettingsPage"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const CreditsPage = lazy(() => import("./pages/CreditsPage"));
const ApiAccessPage = lazy(() => import("./pages/ApiAccessPage"));
const TeamManagementPage = lazy(() => import("./pages/TeamManagementPage"));
const TeamVaultPage = lazy(() => import("./pages/TeamVaultPage"));

// Automation — lazy
const ImportPage = lazy(() => import("./pages/ImportPage"));
const BulkSyncPage = lazy(() => import("./pages/BulkSyncPage"));
const AutoSyncPage = lazy(() => import("./pages/AutoSyncPage"));
const ProviderOnboardingPage = lazy(() => import("./pages/ProviderOnboardingPage"));
const CredentialHistoryPage = lazy(() => import("./pages/CredentialHistoryPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage"));

// Developer API — lazy
const DeveloperDocsPage = lazy(() => import("./pages/DeveloperDocsPage"));
const WebhooksPage = lazy(() => import("./pages/WebhooksPage"));
const NotificationChannelsPage = lazy(() => import("./pages/NotificationChannelsPage"));
const ApiAnalyticsPage = lazy(() => import("./pages/ApiAnalyticsPage"));
const CliToolPage = lazy(() => import("./pages/CliToolPage"));

// Admin — lazy
const ReleaseManagementPage = lazy(() => import("./pages/ReleaseManagementPage"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const SelfImprovementDashboard = lazy(() => import("./pages/SelfImprovementDashboard"));

// Project Files — lazy
const ProjectFilesViewer = lazy(() => import("./pages/ProjectFilesViewer"));

// ─── Loading fallback ────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function DashboardRouter() {
  return (
    <FetcherLayout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          {/* Main Dashboard - Builder Chat */}
          <Route path="/dashboard" component={ChatPage} />

          {/* Developer Tools */}
          <Route path="/replicate" component={ReplicatePage} />
          <Route path="/sandbox" component={SandboxPage} />
          <Route path="/fetcher/smart-fetch" component={SmartFetchPage} />
          <Route path="/fetcher/new" component={FetcherNew} />
          <Route path="/fetcher/jobs" component={FetcherJobs} />
          <Route path="/fetcher/jobs/:id" component={FetcherJobDetail} />
          <Route path="/marketplace" component={MarketplacePage} />
          <Route path="/marketplace/:rest*" component={MarketplacePage} />
          <Route path="/project-files" component={ProjectFilesViewer} />
          <Route path="/project-files/:projectId" component={ProjectFilesViewer} />

          {/* Security */}
          <Route path="/fetcher/totp-vault" component={TotpVaultPage} />
          <Route path="/fetcher/watchdog" component={WatchdogPage} />
          <Route path="/fetcher/provider-health" component={ProviderHealthPage} />
          <Route path="/fetcher/health-trends" component={HealthTrendsPage} />
          <Route path="/fetcher/leak-scanner" component={LeakScannerPage} />
          <Route path="/fetcher/credential-health" component={CredentialHealthPage} />

          {/* Business & Funding */}
          <Route path="/grants" component={GrantsPage} />
          <Route path="/grants/:id" component={GrantDetailPage} />
          <Route path="/grant-applications" component={GrantApplicationsPage} />
          <Route path="/companies" component={CompaniesPage} />
          <Route path="/business-plans" component={BusinessPlanPage} />
          <Route path="/crowdfunding" component={CrowdfundingPage} />
          <Route path="/crowdfunding/:rest*" component={CrowdfundingPage} />
          <Route path="/referrals" component={ReferralsPage} />
          <Route path="/advertising" component={AdvertisingDashboard} />
          <Route path="/affiliate" component={AffiliateDashboard} />
          <Route path="/seo" component={SeoDashboard} />
          <Route path="/blog-admin" component={BlogAdmin} />
          <Route path="/marketing" component={MarketingPage} />

          {/* Account & Settings */}
          <Route path="/dashboard/subscription" component={SubscriptionPage} />
          <Route path="/dashboard/credits" component={CreditsPage} />
          <Route path="/fetcher/credentials" component={FetcherCredentials} />
          <Route path="/fetcher/api-access" component={ApiAccessPage} />
          <Route path="/fetcher/team" component={TeamManagementPage} />
          <Route path="/fetcher/team-vault" component={TeamVaultPage} />
          <Route path="/fetcher/settings" component={FetcherSettings} />
          <Route path="/fetcher/killswitch" component={FetcherKillSwitch} />
          <Route path="/fetcher/account" component={AccountSettingsPage} />

          {/* Automation */}
          <Route path="/fetcher/export" component={FetcherExport} />
          <Route path="/fetcher/import" component={ImportPage} />
          <Route path="/fetcher/bulk-sync" component={BulkSyncPage} />
          <Route path="/fetcher/auto-sync" component={AutoSyncPage} />
          <Route path="/fetcher/onboarding" component={ProviderOnboardingPage} />
          <Route path="/fetcher/history" component={CredentialHistoryPage} />
          <Route path="/fetcher/audit-logs" component={AuditLogsPage} />

          {/* Developer API */}
          <Route path="/fetcher/developer-docs" component={DeveloperDocsPage} />
          <Route path="/fetcher/webhooks" component={WebhooksPage} />
          <Route path="/fetcher/notifications" component={NotificationChannelsPage} />
          <Route path="/fetcher/api-analytics" component={ApiAnalyticsPage} />
          <Route path="/fetcher/cli" component={CliToolPage} />

          {/* Admin */}
          <Route path="/fetcher/releases" component={ReleaseManagementPage} />
          <Route path="/fetcher/admin" component={AdminPanel} />
          <Route path="/fetcher/self-improvement" component={SelfImprovementDashboard} />

          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </FetcherLayout>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Public landing page */}
        <Route path="/" component={LandingPage} />

        {/* Auth pages */}
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/desktop-login" component={DesktopLoginPage} />

        {/* Public pages */}
        <Route path="/pricing" component={PricingPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/blog" component={BlogPage} />
        <Route path="/blog/:rest*" component={BlogPage} />

        {/* Dashboard routes — wrapped in FetcherLayout with sidebar + auth */}
        <Route path="/dashboard/:rest*" component={DashboardRouter} />
        <Route path="/dashboard" component={DashboardRouter} />
        <Route path="/fetcher/:rest*" component={DashboardRouter} />
        <Route path="/replicate" component={DashboardRouter} />
        <Route path="/sandbox" component={DashboardRouter} />
        <Route path="/marketplace/:rest*" component={DashboardRouter} />
        <Route path="/marketplace" component={DashboardRouter} />
        <Route path="/project-files/:rest*" component={DashboardRouter} />
        <Route path="/project-files" component={DashboardRouter} />
        <Route path="/grants/:rest*" component={DashboardRouter} />
        <Route path="/grants" component={DashboardRouter} />
        <Route path="/grant-applications" component={DashboardRouter} />
        <Route path="/companies" component={DashboardRouter} />
        <Route path="/business-plans" component={DashboardRouter} />
        <Route path="/crowdfunding/:rest*" component={DashboardRouter} />
        <Route path="/crowdfunding" component={DashboardRouter} />
        <Route path="/referrals" component={DashboardRouter} />
        <Route path="/advertising" component={DashboardRouter} />
        <Route path="/affiliate" component={DashboardRouter} />
        <Route path="/seo" component={DashboardRouter} />
        <Route path="/blog-admin" component={DashboardRouter} />
        <Route path="/marketing" component={DashboardRouter} />

        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
