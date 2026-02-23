import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import FetcherLayout from "./components/FetcherLayout";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
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

/** Wrap a lazy page in a per-route error boundary */
function Guarded({ name, children }: { name: string; children: React.ReactNode }) {
  return <RouteErrorBoundary pageName={name}>{children}</RouteErrorBoundary>;
}

function DashboardRouter() {
  return (
    <FetcherLayout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          {/* Main Dashboard - Builder Chat */}
          <Route path="/dashboard">{() => <Guarded name="Builder Chat"><ChatPage /></Guarded>}</Route>

          {/* Developer Tools */}
          <Route path="/replicate">{() => <Guarded name="Clone Website"><ReplicatePage /></Guarded>}</Route>
          <Route path="/sandbox">{() => <Guarded name="Sandbox"><SandboxPage /></Guarded>}</Route>
          <Route path="/fetcher/smart-fetch">{() => <Guarded name="Smart Fetch"><SmartFetchPage /></Guarded>}</Route>
          <Route path="/fetcher/new">{() => <Guarded name="New Fetch"><FetcherNew /></Guarded>}</Route>
          <Route path="/fetcher/jobs">{() => <Guarded name="Jobs"><FetcherJobs /></Guarded>}</Route>
          <Route path="/fetcher/jobs/:id">{(params) => <Guarded name="Job Detail"><FetcherJobDetail {...(params as any)} /></Guarded>}</Route>
          <Route path="/marketplace">{() => <Guarded name="Marketplace"><MarketplacePage /></Guarded>}</Route>
          <Route path="/marketplace/:rest*">{() => <Guarded name="Marketplace"><MarketplacePage /></Guarded>}</Route>
          <Route path="/project-files">{() => <Guarded name="Project Files"><ProjectFilesViewer /></Guarded>}</Route>
          <Route path="/project-files/:projectId">{(params) => <Guarded name="Project Files"><ProjectFilesViewer {...(params as any)} /></Guarded>}</Route>

          {/* Security */}
          <Route path="/fetcher/totp-vault">{() => <Guarded name="TOTP Vault"><TotpVaultPage /></Guarded>}</Route>
          <Route path="/fetcher/watchdog">{() => <Guarded name="Watchdog"><WatchdogPage /></Guarded>}</Route>
          <Route path="/fetcher/provider-health">{() => <Guarded name="Provider Health"><ProviderHealthPage /></Guarded>}</Route>
          <Route path="/fetcher/health-trends">{() => <Guarded name="Health Trends"><HealthTrendsPage /></Guarded>}</Route>
          <Route path="/fetcher/leak-scanner">{() => <Guarded name="Leak Scanner"><LeakScannerPage /></Guarded>}</Route>
          <Route path="/fetcher/credential-health">{() => <Guarded name="Credential Health"><CredentialHealthPage /></Guarded>}</Route>

          {/* Business & Funding */}
          <Route path="/grants">{() => <Guarded name="Grants"><GrantsPage /></Guarded>}</Route>
          <Route path="/grants/:id">{(params) => <Guarded name="Grant Detail"><GrantDetailPage {...(params as any)} /></Guarded>}</Route>
          <Route path="/grant-applications">{() => <Guarded name="Grant Applications"><GrantApplicationsPage /></Guarded>}</Route>
          <Route path="/companies">{() => <Guarded name="Companies"><CompaniesPage /></Guarded>}</Route>
          <Route path="/business-plans">{() => <Guarded name="Business Plans"><BusinessPlanPage /></Guarded>}</Route>
          <Route path="/crowdfunding">{() => <Guarded name="Crowdfunding"><CrowdfundingPage /></Guarded>}</Route>
          <Route path="/crowdfunding/:rest*">{() => <Guarded name="Crowdfunding"><CrowdfundingPage /></Guarded>}</Route>
          <Route path="/referrals">{() => <Guarded name="Referrals"><ReferralsPage /></Guarded>}</Route>
          <Route path="/advertising">{() => <Guarded name="Advertising"><AdvertisingDashboard /></Guarded>}</Route>
          <Route path="/affiliate">{() => <Guarded name="Affiliate"><AffiliateDashboard /></Guarded>}</Route>
          <Route path="/seo">{() => <Guarded name="SEO"><SeoDashboard /></Guarded>}</Route>
          <Route path="/blog-admin">{() => <Guarded name="Blog Admin"><BlogAdmin /></Guarded>}</Route>
          <Route path="/marketing">{() => <Guarded name="Marketing"><MarketingPage /></Guarded>}</Route>

          {/* Account & Settings */}
          <Route path="/dashboard/subscription">{() => <Guarded name="Subscription"><SubscriptionPage /></Guarded>}</Route>
          <Route path="/dashboard/credits">{() => <Guarded name="Credits"><CreditsPage /></Guarded>}</Route>
          <Route path="/fetcher/credentials">{() => <Guarded name="Credentials"><FetcherCredentials /></Guarded>}</Route>
          <Route path="/fetcher/api-access">{() => <Guarded name="API Access"><ApiAccessPage /></Guarded>}</Route>
          <Route path="/fetcher/team">{() => <Guarded name="Team"><TeamManagementPage /></Guarded>}</Route>
          <Route path="/fetcher/team-vault">{() => <Guarded name="Team Vault"><TeamVaultPage /></Guarded>}</Route>
          <Route path="/fetcher/settings">{() => <Guarded name="Settings"><FetcherSettings /></Guarded>}</Route>
          <Route path="/fetcher/killswitch">{() => <Guarded name="Kill Switch"><FetcherKillSwitch /></Guarded>}</Route>
          <Route path="/fetcher/account">{() => <Guarded name="Account"><AccountSettingsPage /></Guarded>}</Route>

          {/* Automation */}
          <Route path="/fetcher/export">{() => <Guarded name="Export"><FetcherExport /></Guarded>}</Route>
          <Route path="/fetcher/import">{() => <Guarded name="Import"><ImportPage /></Guarded>}</Route>
          <Route path="/fetcher/bulk-sync">{() => <Guarded name="Bulk Sync"><BulkSyncPage /></Guarded>}</Route>
          <Route path="/fetcher/auto-sync">{() => <Guarded name="Auto Sync"><AutoSyncPage /></Guarded>}</Route>
          <Route path="/fetcher/onboarding">{() => <Guarded name="Onboarding"><ProviderOnboardingPage /></Guarded>}</Route>
          <Route path="/fetcher/history">{() => <Guarded name="History"><CredentialHistoryPage /></Guarded>}</Route>
          <Route path="/fetcher/audit-logs">{() => <Guarded name="Audit Logs"><AuditLogsPage /></Guarded>}</Route>

          {/* Developer API */}
          <Route path="/fetcher/developer-docs">{() => <Guarded name="Developer Docs"><DeveloperDocsPage /></Guarded>}</Route>
          <Route path="/fetcher/webhooks">{() => <Guarded name="Webhooks"><WebhooksPage /></Guarded>}</Route>
          <Route path="/fetcher/notifications">{() => <Guarded name="Notifications"><NotificationChannelsPage /></Guarded>}</Route>
          <Route path="/fetcher/api-analytics">{() => <Guarded name="API Analytics"><ApiAnalyticsPage /></Guarded>}</Route>
          <Route path="/fetcher/cli">{() => <Guarded name="CLI Tool"><CliToolPage /></Guarded>}</Route>

          {/* Admin */}
          <Route path="/fetcher/releases">{() => <Guarded name="Releases"><ReleaseManagementPage /></Guarded>}</Route>
          <Route path="/fetcher/admin">{() => <Guarded name="Admin Panel"><AdminPanel /></Guarded>}</Route>
          <Route path="/fetcher/self-improvement">{() => <Guarded name="Self Improvement"><SelfImprovementDashboard /></Guarded>}</Route>

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
