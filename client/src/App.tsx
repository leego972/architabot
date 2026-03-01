import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import FetcherLayout from "./components/FetcherLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ArchibaldProvider } from "./contexts/ArchibaldContext";

// Public pages
import LandingPage from "./pages/LandingPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import ContactPage from "./pages/ContactPage";
import PricingPage from "./pages/PricingPage";
import BlogPage from "./pages/BlogPage";

// Auth pages
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import DesktopLoginPage from "./pages/DesktopLoginPage";

// Dashboard / Builder
import ChatPage from "./pages/ChatPage";
import FetcherNew from "./pages/FetcherNew";
import FetcherJobs from "./pages/FetcherJobs";
import FetcherJobDetail from "./pages/FetcherJobDetail";
import FetcherCredentials from "./pages/FetcherCredentials";
import FetcherExport from "./pages/FetcherExport";
import FetcherSettings from "./pages/FetcherSettings";
import FetcherKillSwitch from "./pages/FetcherKillSwitch";

// Developer Tools
import ReplicatePage from "./pages/ReplicatePage";
import SandboxPage from "./pages/SandboxPage";
import SmartFetchPage from "./pages/SmartFetchPage";
import MarketplacePage from "./pages/MarketplacePage";

// Security
import WatchdogPage from "./pages/WatchdogPage";
import ProviderHealthPage from "./pages/ProviderHealthPage";
import HealthTrendsPage from "./pages/HealthTrendsPage";
import LeakScannerPage from "./pages/LeakScannerPage";
import CredentialHealthPage from "./pages/CredentialHealthPage";
import TotpVaultPage from "./pages/TotpVaultPage";

// Business & Funding
import GrantsPage from "./pages/GrantsPage";
import GrantDetailPage from "./pages/GrantDetailPage";
import GrantApplicationsPage from "./pages/GrantApplicationsPage";
import CompaniesPage from "./pages/CompaniesPage";
import BusinessPlanPage from "./pages/BusinessPlanPage";
import CrowdfundingPage from "./pages/CrowdfundingPage";
import ReferralsPage from "./pages/ReferralsPage";
import AdvertisingDashboard from "./pages/AdvertisingDashboard";
import AffiliateDashboard from "./pages/AffiliateDashboard";
import SeoDashboard from "./pages/SeoDashboard";
import BlogAdmin from "./pages/BlogAdmin";
import MarketingPage from "./pages/MarketingPage";

// Account & Settings
import AccountSettingsPage from "./pages/AccountSettingsPage";
import SubscriptionPage from "./pages/SubscriptionPage";
import CreditsPage from "./pages/CreditsPage";
import ApiAccessPage from "./pages/ApiAccessPage";
import TeamManagementPage from "./pages/TeamManagementPage";
import TeamVaultPage from "./pages/TeamVaultPage";

// Automation
import ImportPage from "./pages/ImportPage";
import BulkSyncPage from "./pages/BulkSyncPage";
import AutoSyncPage from "./pages/AutoSyncPage";
import ProviderOnboardingPage from "./pages/ProviderOnboardingPage";
import CredentialHistoryPage from "./pages/CredentialHistoryPage";
import AuditLogsPage from "./pages/AuditLogsPage";

// Developer API
import DeveloperDocsPage from "./pages/DeveloperDocsPage";
import WebhooksPage from "./pages/WebhooksPage";
import NotificationChannelsPage from "./pages/NotificationChannelsPage";
import ApiAnalyticsPage from "./pages/ApiAnalyticsPage";
import CliToolPage from "./pages/CliToolPage";

// Admin
import ReleaseManagementPage from "./pages/ReleaseManagementPage";
import AdminPanel from "./pages/AdminPanel";
import SelfImprovementDashboard from "./pages/SelfImprovementDashboard";

// Project Files
import ProjectFilesViewer from "./pages/ProjectFilesViewer";

// Site Monitor
import SiteMonitorPage from "./pages/SiteMonitorPage";

function DashboardRouter() {
  return (
    <FetcherLayout>
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

        {/* Site Monitor */}
        <Route path="/site-monitor" component={SiteMonitorPage} />

        {/* Admin */}
        <Route path="/fetcher/releases" component={ReleaseManagementPage} />
        <Route path="/fetcher/admin" component={AdminPanel} />
        <Route path="/fetcher/self-improvement" component={SelfImprovementDashboard} />

        <Route component={NotFound} />
      </Switch>
    </FetcherLayout>
  );
}

function Router() {
  return (
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
      <Route path="/site-monitor" component={DashboardRouter} />

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable={true}>
        <ArchibaldProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ArchibaldProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
