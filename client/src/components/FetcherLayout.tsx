import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { useSubscription } from "@/hooks/useSubscription";
import { PlanBadge } from "@/components/UpgradePrompt";
import {
  PlusCircle,
  ListOrdered,
  KeyRound,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Download,
  LogOut,
  PanelLeft,
  Crown,
  Key,
  Users,
  ScrollText,
  Package,
  Timer,
  RefreshCw,
  History,
  Activity,
  CalendarClock,
  Sparkles,
  TrendingUp,
  ScanSearch,
  Wand2,
  Vault,
  Book,
  Webhook,
  BarChart3,
  UserCog,
  Zap,
  CreditCard,
  Upload,
  Clock,
  Bell,
  Terminal,
  Search,
  Building2,
  FileText,
  Rocket,
  Copy,
  Megaphone,
  DollarSign,
  Gift,
  Store,
  ShoppingBag,
  Package2,
  LayoutDashboard,
  Sun,
  Moon,
  FolderOpen,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { TitanLogo } from "./TitanLogo";
import { Button } from "./ui/button";
import OnboardingWizard from "./OnboardingWizard";
import HelpBotWidget from "./HelpBotWidget";
import TrialBanner from "./TrialBanner";
import DesktopStatusBar from "./DesktopStatusBar";
import { isDesktop } from "@/lib/desktop";
import { useArchibald } from "@/contexts/ArchibaldContext";
import { useTheme } from "@/contexts/ThemeContext";
import { LanguageSelector } from "@/i18n";
import { AT_ICON_128 } from "@/lib/logos";

type MenuItem = {
  icon: any;
  label: string;
  path: string;
  adminOnly?: boolean;
  premiumOnly?: boolean;
  isNew?: boolean;
  isCyber?: boolean;
};

type MenuGroup = {
  title: string;
  items: MenuItem[];
};

const menuGroups: MenuGroup[] = [
  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: DEVELOPER TOOLS
  // ═══════════════════════════════════════════════════════════════
  {
    title: "Developer Tools",
    items: [
      { icon: () => <TitanLogo size="sm" />, label: "Titan Builder", path: "/dashboard" },
      { icon: Copy, label: "Clone Website", path: "/replicate", isNew: true, premiumOnly: true },
      { icon: Terminal, label: "Sandbox", path: "/sandbox", isNew: true },
      { icon: FolderOpen, label: "My Projects", path: "/project-files", isNew: true },
      { icon: Sparkles, label: "Smart Fetch AI", path: "/fetcher/smart-fetch" },
      { icon: PlusCircle, label: "New Fetch", path: "/fetcher/new" },
      { icon: ListOrdered, label: "Fetch Jobs", path: "/fetcher/jobs" },
      { icon: Store, label: "Grand Bazaar", path: "/marketplace", isNew: true },
      { icon: Package2, label: "My Inventory", path: "/marketplace/inventory", isNew: true },
      { icon: ShoppingBag, label: "Sell / Listings", path: "/marketplace/sell", isNew: true },
      { icon: LayoutDashboard, label: "Seller Dashboard", path: "/marketplace/seller", isNew: true },
    ],
  },
  // ═══════════════════════════════════════════════════════════════
  // SECTION 1b: SECURITY TOOLS
  // ═══════════════════════════════════════════════════════════════
  {
    title: "Security",
    items: [
      { icon: Clock, label: "TOTP Vault", path: "/fetcher/totp-vault", isCyber: true },
      { icon: Timer, label: "Expiry Watchdog", path: "/fetcher/watchdog" },
      { icon: Activity, label: "Provider Health", path: "/fetcher/provider-health" },
      { icon: TrendingUp, label: "Health Trends", path: "/fetcher/health-trends", isCyber: true },
      { icon: ScanSearch, label: "Leak Scanner", path: "/fetcher/leak-scanner", isCyber: true },
      { icon: ShieldCheck, label: "Credential Health", path: "/fetcher/credential-health", isCyber: true },
    ],
  },
  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: BUSINESS & FUNDING
  // ═══════════════════════════════════════════════════════════════
  {
    title: "Business & Funding",
    items: [
      { icon: Search, label: "Browse Grants", path: "/grants", isNew: true },
      { icon: FileText, label: "Grant Applications", path: "/grant-applications", isNew: true },
      { icon: Building2, label: "Companies", path: "/companies", isNew: true },
      { icon: FileText, label: "Business Plans", path: "/business-plans", isNew: true },
      { icon: Rocket, label: "Crowdfunding", path: "/crowdfunding", isNew: true },
      { icon: FileText, label: "My Campaigns", path: "/crowdfunding/my-campaigns", isNew: true },
      { icon: Megaphone, label: "Advertising", path: "/advertising", adminOnly: true, isNew: true },
      { icon: DollarSign, label: "Affiliate Dashboard", path: "/affiliate", adminOnly: true, isNew: true },
      { icon: Gift, label: "My Referrals", path: "/referrals", isNew: true },
      { icon: Search, label: "SEO Command Center", path: "/seo", adminOnly: true, isNew: true },
      { icon: FileText, label: "Blog Engine", path: "/blog-admin", adminOnly: true, isNew: true },
      { icon: Megaphone, label: "Marketing Engine", path: "/marketing", adminOnly: true, isNew: true },
    ],
  },
  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: ACCOUNT & SETTINGS
  // ═══════════════════════════════════════════════════════════════
  {
    title: "Account & Settings",
    items: [
      { icon: CreditCard, label: "Subscription", path: "/dashboard/subscription" },
      { icon: KeyRound, label: "Credentials", path: "/fetcher/credentials" },
      { icon: Key, label: "API Access", path: "/fetcher/api-access" },
      { icon: Users, label: "Team Management", path: "/fetcher/team" },
      { icon: Vault, label: "Team Vault", path: "/fetcher/team-vault", isNew: true },
      { icon: Settings, label: "Settings", path: "/fetcher/settings" },
      { icon: ShieldAlert, label: "Kill Switch", path: "/fetcher/killswitch" },
    ],
  },
  // ═══════════════════════════════════════════════════════════════
  // SECTION 3b: DATA & AUTOMATION
  // ═══════════════════════════════════════════════════════════════
  {
    title: "Automation",
    items: [
      { icon: Download, label: "CSV Export", path: "/fetcher/export" },
      { icon: Upload, label: "Import", path: "/fetcher/import", isNew: true },
      { icon: RefreshCw, label: "Bulk Sync", path: "/fetcher/bulk-sync" },
      { icon: CalendarClock, label: "Auto-Sync", path: "/fetcher/auto-sync" },
      { icon: Wand2, label: "Provider Onboarding", path: "/fetcher/onboarding", isNew: true },
      { icon: History, label: "Credential History", path: "/fetcher/history" },
      { icon: ScrollText, label: "Audit Logs", path: "/fetcher/audit-logs" },
    ],
  },
  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: DEVELOPER API & ADMIN
  // ═══════════════════════════════════════════════════════════════
  {
    title: "Developer API",
    items: [
      { icon: Book, label: "API Docs", path: "/fetcher/developer-docs", isNew: true },
      { icon: Webhook, label: "Webhooks", path: "/fetcher/webhooks", isNew: true },
      { icon: Bell, label: "Notifications", path: "/fetcher/notifications", isNew: true },
      { icon: BarChart3, label: "API Analytics", path: "/fetcher/api-analytics", isNew: true },
      { icon: Terminal, label: "CLI Tool", path: "/fetcher/cli", isNew: true },
    ],
  },
  {
    title: "Admin",
    items: [
      { icon: Package, label: "Releases", path: "/fetcher/releases", adminOnly: true },
      { icon: UserCog, label: "User Management", path: "/fetcher/admin", adminOnly: true, isNew: true },
      { icon: Zap, label: "Self-Improvement", path: "/fetcher/self-improvement", adminOnly: true, isNew: true },
    ],
  },
];
// Flat list for active item detection
const allMenuItems = menuGroups.flatMap((g) => g.items);

const SIDEBAR_WIDTH_KEY = "fetcher-sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

function ArchibaldToggleItem() {
  const { isEnabled, toggle } = useArchibald();
  return (
    <DropdownMenuItem
      onClick={(e) => {
        e.preventDefault();
        toggle();
      }}
      className="cursor-pointer"
    >
      <Wand2 className="mr-2 h-4 w-4" />
      <span>{isEnabled ? "Hide Help Bot" : "Show Help Bot"}</span>
    </DropdownMenuItem>
  );
}

export default function FetcherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl" />
            <div className="relative flex items-center gap-3">
              <TitanLogo size="xl" />
              <h1 className="text-3xl font-bold tracking-tight">
                Archibald Titan
              </h1>
            </div>
          </div>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Sign in to access Fetcher and manage your API credentials securely.
          </p>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl(window.location.pathname);
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all bg-blue-600 hover:bg-blue-500"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <FetcherLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </FetcherLayoutContent>
      <OnboardingWizard />
      <HelpBotWidget />
      {isDesktop() && <DesktopStatusBar />}
    </SidebarProvider>
  );
}

function FetcherLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const sub = useSubscription();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = allMenuItems.find(
    (item) => item.path === location || (item.path !== "/dashboard" && location.startsWith(item.path))
  );
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft =
        sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <img loading="eager" src={AT_ICON_128} alt="AT" className="h-8 w-8 shrink-0 object-contain" />
                  <span className="font-semibold tracking-tight truncate bg-gradient-to-r from-blue-400 to-blue-200 bg-clip-text text-transparent">
                    Archibald Titan
                  </span>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 overflow-y-auto scrollbar-thin">
            {menuGroups.map((group) => {
              const visibleItems = group.items.filter(
                (item) => {
                  if (item.adminOnly && user?.role !== "admin") return false;
                  if (item.premiumOnly) {
                    const plan = sub.planId;
                    if (plan !== "cyber_plus" && plan !== "titan" && user?.role !== "admin") return false;
                  }
                  return true;
                }
              );
              if (visibleItems.length === 0) return null;
              return (
                <div key={group.title} className="mb-1">
                  {!isCollapsed && (
                    <div className="px-4 pt-4 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
                        {group.title}
                      </span>
                    </div>
                  )}
                  {isCollapsed && <div className="h-2" />}
                  <SidebarMenu className="px-2 py-0.5">
                    {visibleItems.map((item) => {
                      const isActive =
                        item.path === "/dashboard"
                          ? location === "/dashboard"
                          : location.startsWith(item.path);
                      return (
                        <SidebarMenuItem key={item.path}>
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => setLocation(item.path)}
                            tooltip={item.label}
                            className={`h-10 sm:h-9 transition-all font-normal ${
                              isActive
                                ? "bg-blue-500/10 text-blue-400 font-medium"
                                : "hover:bg-white/[0.04]"
                            }`}
                          >
                            <item.icon
                              className={`h-4 w-4 shrink-0 ${isActive ? "text-blue-400" : "text-muted-foreground"}`}
                            />
                            <span className="flex-1 truncate">{item.label}</span>
                            {item.isCyber && !isCollapsed && (
                              <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                                cyber
                              </span>
                            )}
                            {item.isNew && !item.isCyber && !isCollapsed && (
                              <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
                                new
                              </span>
                            )}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </div>
              );
            })}
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-white/5">
            {!isCollapsed && (
              <div className="flex items-center justify-between px-2 pb-2">
                <LanguageSelector />
                {toggleTheme && (
                  <button
                    onClick={toggleTheme}
                    className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                    title={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
                  >
                    {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-blue-400" />}
                  </button>
                )}
              </div>
            )}
            {isCollapsed && (
              <div className="flex flex-col items-center gap-2 pb-2">
                <LanguageSelector compact />
                {toggleTheme && (
                  <button
                    onClick={toggleTheme}
                    className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                    title={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
                  >
                    {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-blue-400" />}
                  </button>
                )}
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04] transition-all w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border border-blue-500/20 shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-blue-500/10 text-blue-400">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate leading-none">
                        {user?.name || "-"}
                      </p>
                      <PlanBadge planId={sub.planId} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onClick={() => setLocation("/fetcher/account")}
                  className="cursor-pointer h-10 sm:h-auto"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Account Settings</span>
                </DropdownMenuItem>
                <ArchibaldToggleItem />
                {toggleTheme && (
                  <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
                    {theme === 'dark' ? <Sun className="mr-2 h-4 w-4 text-amber-400" /> : <Moon className="mr-2 h-4 w-4 text-blue-400" />}
                    <span>{theme === 'dark' ? 'Day Mode' : 'Night Mode'}</span>
                  </DropdownMenuItem>
                )}
                {sub.isFree && (
                  <DropdownMenuItem
                    onClick={() => setLocation("/pricing")}
                    className="cursor-pointer text-amber-500 focus:text-amber-500"
                  >
                    <Crown className="mr-2 h-4 w-4" />
                    <span>Upgrade Plan</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive h-10 sm:h-auto"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b border-white/10 h-14 items-center justify-between bg-background px-3 sticky top-0 z-50 safe-area-top [.chat-page-root_&]:hidden max-md:[&:has(~main_.chat-page-root)]:hidden" id="mobile-nav-header">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-10 w-10 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-foreground [&_svg]:!h-5 [&_svg]:!w-5" />
              <div className="flex items-center gap-2">
                <img loading="eager" src={AT_ICON_128} alt="AT" className="h-8 w-8 object-contain" />
                <span className="tracking-tight text-foreground font-semibold text-sm">
                  {activeMenuItem?.label ?? "Archibald Titan"}
                </span>
              </div>
            </div>
            <LanguageSelector compact />
          </div>
        )}
        <TrialBanner />
        <main className="flex-1 p-3 sm:p-4 md:p-6 max-md:[&:has(.chat-page-root)]:p-0 [&:has(.chat-page-root)]:overflow-hidden">{children}</main>
      </SidebarInset>
    </>
  );
}
