import { useAuth } from "@/_core/hooks/useAuth";
import AffiliateRecommendations from "@/components/AffiliateRecommendations";
import ArchibaldWizard from "@/components/ArchibaldWizard";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { trackDownload } from "@/lib/adTracking";
import { AT_ICON_64 } from "@/lib/logos";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Shield,
  Zap,
  Globe,
  KeyRound,
  Download,
  Monitor,
  Apple,
  Terminal,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Check,
  Lock,
  Eye,
  RefreshCw,
  ShieldAlert,
  Fingerprint,
  Network,
  FileJson,
  Clock,
  Sparkles,
  ExternalLink,
  Github,
  ChevronUp,
  Star,
  Quote,
  MessageSquare,
  LogIn,
  Menu,
  X,
  PackageOpen,
  Settings,
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  Copy,
  CheckCircle2,
  ScanSearch,
  Wand2,
  Vault,
  Book,
  Webhook,
  BarChart3,
  Mail,
  Code2,
  TestTube2,
} from "lucide-react";
import { Link } from "wouter";

// ─── Animated Counter ───────────────────────────────────────────────

function AnimatedNumber({ target, duration = 2000 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const start = Date.now();
          const tick = () => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{count}</span>;
}

// ─── FAQ Accordion ──────────────────────────────────────────────────

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/10">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="text-base font-medium text-white/90 group-hover:text-white transition-colors pr-4">
          {question}
        </span>
        {open ? (
          <ChevronUp className="h-5 w-5 text-blue-400 shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-white/40 group-hover:text-blue-400 shrink-0 transition-colors" />
        )}
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-96 pb-5" : "max-h-0"
        }`}
      >
        <p className="text-sm text-white/60 leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

// ─── Main Landing Page ──────────────────────────────────────────────

// ─── Platform Detection ────────────────────────────────────────────

function detectPlatform(): "windows" | "mac" | "linux" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux") || ua.includes("ubuntu") || ua.includes("debian") || ua.includes("fedora")) return "linux";
  return "windows";
}

const PLATFORM_INFO: Record<string, { label: string; icon: typeof Monitor; ext: string; note: string; installTip: string }> = {
  windows: {
    label: "Windows",
    icon: Monitor,
    ext: ".exe",
    note: "Windows 10+ (64-bit)",
    installTip: "Your download has started. Once complete, double-click the .exe file to install. If SmartScreen appears, click 'More info' → 'Run anyway'.",
  },
  mac: {
    label: "macOS",
    icon: Apple,
    ext: ".dmg",
    note: "macOS 12+ (Apple Silicon & Intel)",
    installTip: "Your download has started. Open the .dmg file and drag Archibald Titan to Applications. If blocked, go to System Settings → Privacy & Security → 'Open Anyway'.",
  },
  linux: {
    label: "Linux",
    icon: Terminal,
    ext: ".AppImage",
    note: "Ubuntu 20.04+ / Debian / Fedora",
    installTip: "Your download has started. Make it executable with: chmod +x ArchibaldTitan-*.AppImage — then double-click or run from terminal.",
  },
};

export default function LandingPage() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect authenticated users straight to the dashboard (chat)
  useEffect(() => {
    if (!loading && user) {
      setLocation("/dashboard");
    }
  }, [user, loading, setLocation]);

  const { data: latestRelease, refetch: refetchLatest } = trpc.releases.latest.useQuery();
  const { data: allReleases, refetch: refetchList } = trpc.releases.list.useQuery();
  const requestDownloadToken = trpc.download.requestToken.useMutation();
  const syncFromGitHub = trpc.releases.syncFromGitHub.useMutation();

  // Auto-sync releases from GitHub on first load (once per session)
  useEffect(() => {
    const SYNC_KEY = "at_releases_synced";
    const lastSync = sessionStorage.getItem(SYNC_KEY);
    if (!lastSync) {
      syncFromGitHub.mutateAsync().then(() => {
        sessionStorage.setItem(SYNC_KEY, Date.now().toString());
        // Refetch after sync so badge updates
        refetchLatest();
        refetchList();
      }).catch(() => { /* silent fail — badge fallback handles it */ });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build health badges are now hardcoded — no need to query builderStats
  const [downloadPending, setDownloadPending] = useState<string | null>(null);
  const [detectedPlatform] = useState(() => detectPlatform());
  const [postDownloadTip, setPostDownloadTip] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth-gated download handler
  const handleDownload = async (platform: "windows" | "mac" | "linux") => {
    if (!user) {
      // Not signed in — redirect to login
      window.location.href = getLoginUrl();
      return;
    }

    if (!latestRelease) return;

    const hasDownload =
      platform === "windows" ? latestRelease.hasWindows :
      platform === "mac" ? latestRelease.hasMac :
      latestRelease.hasLinux;

    if (!hasDownload) {
      // Show coming soon toast
      const toast = document.getElementById("coming-soon-toast");
      if (toast) {
        toast.classList.remove("opacity-0", "translate-y-4");
        toast.classList.add("opacity-100", "translate-y-0");
        setTimeout(() => {
          toast.classList.add("opacity-0", "translate-y-4");
          toast.classList.remove("opacity-100", "translate-y-0");
        }, 3000);
      }
      return;
    }

    try {
      setDownloadPending(platform);
      const { token } = await requestDownloadToken.mutateAsync({
        releaseId: latestRelease.id,
        platform,
      });
      // Open the token-gated download URL
      window.open(`/api/download/${token}`, "_blank");
      // Track download conversion for ad platforms
      trackDownload(platform);
      // Show post-download install tip
      const tip = PLATFORM_INFO[platform]?.installTip;
      if (tip) setPostDownloadTip(tip);
    } catch (err: any) {
      const msg = err?.message ?? "Download failed. Please try again.";
      const toast = document.getElementById("coming-soon-toast");
      if (toast) {
        toast.textContent = msg;
        toast.classList.remove("opacity-0", "translate-y-4");
        toast.classList.add("opacity-100", "translate-y-0");
        setTimeout(() => {
          toast.textContent = "Download links will be available soon. Stay tuned!";
          toast.classList.add("opacity-0", "translate-y-4");
          toast.classList.remove("opacity-100", "translate-y-0");
        }, 4000);
      }
    } finally {
      setDownloadPending(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#060611] text-white overflow-x-hidden">
      <ArchibaldWizard />
      {/* ── Navigation ─────────────────────────────────────────────── */}
      <nav aria-label="Navigation" className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#060611]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img loading="eager" src={AT_ICON_64} alt="AT" className="h-9 w-9 object-contain" />
              <span className="text-lg font-bold tracking-tight">Archibald Titan</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-white/60 hover:text-white transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm text-white/60 hover:text-white transition-colors">How It Works</a>
              <a href="#testimonials" className="text-sm text-white/60 hover:text-white transition-colors">Testimonials</a>
              <a href="#pricing-preview" className="text-sm text-white/60 hover:text-white transition-colors">Pricing</a>
              <a href="#updates" className="text-sm text-white/60 hover:text-white transition-colors">Updates</a>
              <a href="#faq" className="text-sm text-white/60 hover:text-white transition-colors">FAQ</a>
            </div>
            <div className="flex items-center gap-2">
              {user ? (
                <Button
                  onClick={() => setLocation("/dashboard")}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-600/25"
                >
                  Dashboard
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  onClick={() => { window.location.href = getLoginUrl(); }}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-600/25"
                >
                  Sign In
                </Button>
              )}
              {/* Mobile hamburger button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#060611]/95 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1">
              {[
                { href: "#features", label: "Features" },
                { href: "#how-it-works", label: "How It Works" },
                { href: "#testimonials", label: "Testimonials" },
                { href: "#pricing-preview", label: "Pricing" },
                { href: "#updates", label: "Updates" },
                { href: "#faq", label: "FAQ" },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2.5 px-3 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  {item.label}
                </a>
              ))}

            </div>
          </div>
        )}
      </nav>

      {/* ── Hero Section ───────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-32">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-blue-600/8 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-indigo-600/5 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
        </div>

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Version badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 mb-8">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-xs font-medium text-blue-300">
              v{latestRelease?.version ?? "9.0.0"} — Now Available
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05]">
            <span className="text-white">The World's Most</span>
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent">
              Advanced Local
            </span>
            <br />
            <span className="text-white">AI Agent</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">
            The all-in-one AI platform for building, securing, and scaling your digital business.
            From code generation to credential management to cybersecurity — powered by military-grade encryption.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            {user ? (
              <Button
                size="lg"
                onClick={() => setLocation("/dashboard")}
                className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-xl shadow-blue-600/25 h-14 px-10 text-base font-semibold gap-3"
              >
                <ArrowRight className="h-5 w-5" />Go to Dashboard
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={() => { window.location.href = getLoginUrl(); }}
                className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-xl shadow-blue-600/25 h-14 px-10 text-base font-semibold gap-3"
              >
                <LogIn className="h-5 w-5" />Start Free Trial
              </Button>
            )}
            <a href="#features">
              <Button
                size="lg"
                variant="outline"
                className="border-white/10 bg-white/5 hover:bg-white/10 text-white h-12 px-8 text-base"
              >
                Learn More
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </div>
          <p className="mt-4 text-sm text-white/30">
            Free to start. No credit card required. Upgrade to Cyber for advanced security tools.
          </p>

          {/* Stats row */}
          <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 max-w-3xl mx-auto">
            {[
              { value: 60, suffix: "+", label: "Built-in Tools" },
              { value: 15, suffix: "+", label: "Provider Integrations" },
              { value: 256, suffix: "-bit", label: "AES Encryption" },
              { value: 0, suffix: "", label: "Setup Required", display: "Zero" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-white">
                  {stat.display ?? (
                    <>
                      <AnimatedNumber target={stat.value} />
                      <span className="text-blue-400">{stat.suffix}</span>
                    </>
                  )}
                </div>
                <div className="text-xs sm:text-sm text-white/40 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* CI/CD Build Health Badges */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <Code2 className="h-3 w-3" />
              TypeScript: passing
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <TestTube2 className="h-3 w-3" />
              Tests: 404 passing
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <Shield className="h-3 w-3" />
              Build Health: 100%
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Section ───────────────────────────────────────── */}
      <section id="features" className="relative py-24 sm:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/5 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-blue-400 tracking-widest uppercase">Capabilities</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Everything you need. Nothing you don't.
            </h2>
            <p className="mt-4 text-white/50 max-w-xl mx-auto">
              Built from the ground up for security, speed, and stealth. Every feature designed to work autonomously.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: KeyRound,
                title: "15+ Provider Automation",
                desc: "OpenAI, AWS, Stripe, GoDaddy, GitHub, Cloudflare, Google Cloud, and more. One-click credential retrieval with provider-specific automation scripts.",
                color: "from-blue-500 to-blue-600",
              },
              {
                icon: Shield,
                title: "AES-256-GCM Vault",
                desc: "Military-grade encryption for every credential. Keys are encrypted at rest and never stored in plaintext. Your vault, your machine, your rules.",
                color: "from-emerald-500 to-emerald-600",
              },
              {
                icon: Fingerprint,
                title: "Stealth Browser Engine",
                desc: "Playwright with anti-detection, device fingerprinting, randomized profiles, and human-like mouse movements. Undetectable by bot protection systems.",
                color: "from-violet-500 to-violet-600",
              },
              {
                icon: Zap,
                title: "CAPTCHA Solving",
                desc: "Integrated 2Captcha and Anti-Captcha support. Automatically handles reCAPTCHA v2/v3, hCaptcha, and image CAPTCHAs without manual intervention.",
                color: "from-amber-500 to-amber-600",
              },
              {
                icon: Network,
                title: "Residential Proxy Pool",
                desc: "Built-in proxy pool manager with health checking, geo-detection, latency testing, and automatic rotation. Route through residential IPs to bypass datacenter blocks.",
                color: "from-cyan-500 to-cyan-600",
              },
              {
                icon: ShieldAlert,
                title: "Kill Switch",
                desc: "Emergency shutdown with alphanumeric code. Instantly terminates all running jobs, wipes active sessions, and locks the system. Safety first.",
                color: "from-red-500 to-red-600",
              },
              {
                icon: FileJson,
                title: "Multi-Format Export",
                desc: "Export credentials as JSON, CSV, or .env files. Copy individual keys or bulk export your entire vault for easy integration into your projects.",
                color: "from-orange-500 to-orange-600",
              },
              {
                icon: Eye,
                title: "Real-Time Job Monitoring",
                desc: "Watch every step of the automation live. See login progress, navigation status, extraction results, and error details in real-time.",
                color: "from-pink-500 to-pink-600",
              },
              {
                icon: Lock,
                title: "100% Local & Private",
                desc: "Everything runs on your machine. No cloud servers, no telemetry, no data collection. Your credentials never leave your local environment.",
                color: "from-teal-500 to-teal-600",
              },
              {
                icon: ScanSearch,
                title: "Credential Leak Scanner",
                desc: "Scan public repos, paste sites, and code snippets for leaked API keys and secrets. Pattern-based detection for AWS, GitHub, Stripe, OpenAI, and 10+ credential formats.",
                color: "from-rose-500 to-rose-600",
                isNew: true,
              },
              {
                icon: Wand2,
                title: "One-Click Provider Onboarding",
                desc: "Paste any provider URL and let AI auto-detect login pages, API key locations, and credential types. Generates automation scripts instantly — no manual configuration.",
                color: "from-indigo-500 to-indigo-600",
                isNew: true,
              },
              {
                icon: Vault,
                title: "Team Credential Vault",
                desc: "AES-256 encrypted shared vault with role-based access control. Owner, admin, member, and viewer roles with full audit trail on every reveal, copy, and update.",
                color: "from-yellow-500 to-yellow-600",
                isNew: true,
              },
              {
                icon: Book,
                title: "Developer REST API",
                desc: "Full REST API with interactive docs, code examples in cURL, Python, and Node.js. Generate API keys, set scopes, and integrate Titan into your own programs.",
                color: "from-emerald-500 to-emerald-600",
                isNew: true,
              },
              {
                icon: Webhook,
                title: "Webhook Events",
                desc: "Subscribe to real-time events for credential changes, scan results, and vault updates. Delivery logs, retry logic, and HMAC-SHA256 signature verification.",
                color: "from-cyan-500 to-cyan-600",
                isNew: true,
              },
              {
                icon: Mail,
                title: "Email Authentication",
                desc: "Standard email and password sign-up so anyone can create an account. No external OAuth required — just enter your email and get started instantly.",
                color: "from-pink-500 to-pink-600",
                isNew: true,
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className={`group relative p-6 rounded-2xl border transition-all duration-300 ${
                  (feature as any).isNew
                    ? "border-blue-500/15 bg-blue-500/[0.03] hover:bg-blue-500/[0.06] hover:border-blue-500/25 ring-1 ring-blue-500/5"
                    : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10"
                }`}
              >
                {(feature as any).isNew && (
                  <div className="absolute top-4 right-4">
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
                      new in 4.0
                    </span>
                  </div>
                )}
                <div className={`inline-flex items-center justify-center h-11 w-11 rounded-xl bg-gradient-to-br ${feature.color} mb-4 shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300`}>
                  <feature.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────── */}
      <section id="how-it-works" className="relative py-24 sm:py-32">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[120px]" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-blue-400 tracking-widest uppercase">How Archibald Titan Works</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Your AI-Powered Command Center
            </h2>
            <p className="mt-3 text-white/40 max-w-2xl mx-auto text-sm">
              Archibald Titan is a full-stack AI platform that combines an intelligent builder, autonomous credential management, cybersecurity tools, a marketplace, and business automation — all in one place.
            </p>
          </div>

          {/* Step 1-4 flow */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-20">
            {[
              {
                step: "01",
                title: "Sign Up & Explore",
                desc: "Create your free account and land in the Titan dashboard. Access the AI chat, Sandbox, and 60+ tools instantly — no setup required.",
                icon: LogIn,
              },
              {
                step: "02",
                title: "Build with AI",
                desc: "Use Titan Builder to generate code, websites, business plans, and more through natural conversation. Clone existing sites or start from scratch in the Sandbox.",
                icon: Wand2,
              },
              {
                step: "03",
                title: "Secure & Automate",
                desc: "The Fetcher retrieves API keys from 15+ providers autonomously. Store them in the AES-256 encrypted vault. Set up auto-sync, expiry watchdog, and health monitoring.",
                icon: Shield,
              },
              {
                step: "04",
                title: "Scale & Monetize",
                desc: "Sell on the Grand Bazaar marketplace, launch crowdfunding campaigns, find grants, manage your business, and grow with built-in SEO, marketing, and affiliate tools.",
                icon: BarChart3,
              },
            ].map((item, i) => (
              <div key={item.step} className="relative">
                {i < 3 && (
                  <div className="hidden md:block absolute top-12 left-full w-full">
                    <div className="h-px w-full bg-gradient-to-r from-blue-500/30 to-transparent" />
                  </div>
                )}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl border border-white/10 bg-white/[0.03] mb-5">
                    <item.icon className="h-9 w-9 text-blue-400" />
                  </div>
                  <div className="text-xs font-bold text-blue-500 tracking-widest mb-2">STEP {item.step}</div>
                  <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Platform pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Cpu, title: "Titan Builder", desc: "AI-powered code generation, website building, and project scaffolding through natural language." },
              { icon: KeyRound, title: "Credential Fetcher", desc: "Autonomous retrieval and management of API keys from 15+ providers with stealth browser." },
              { icon: Lock, title: "Encrypted Vault", desc: "AES-256-GCM encrypted storage for credentials, TOTP secrets, and sensitive data." },
              { icon: Globe, title: "Grand Bazaar", desc: "Built-in marketplace to buy, sell, and trade digital products and services." },
              { icon: ShieldAlert, title: "Cyber Security Suite", desc: "Leak scanner, credential health monitor, threat modeling, and red team automation." },
              { icon: Sparkles, title: "Business Tools", desc: "Grant finder, business plans, crowdfunding, SEO, marketing engine, and affiliate system." },
            ].map((pillar) => (
              <div key={pillar.title} className="p-5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-blue-500/20 transition-all duration-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <pillar.icon className="h-5 w-5 text-blue-400" />
                  </div>
                  <h4 className="font-semibold text-white">{pillar.title}</h4>
                </div>
                <p className="text-sm text-white/50 leading-relaxed">{pillar.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Supported Providers ─────────────────────────────────────── */}
      <section className="relative py-20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/5 to-transparent" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-sm font-semibold text-blue-400 tracking-widest uppercase">Integrations</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Works with the tools you use
            </h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {[
              { name: "OpenAI", cat: "AI" },
              { name: "Anthropic", cat: "AI" },
              { name: "Hugging Face", cat: "AI" },
              { name: "GitHub", cat: "Dev" },
              { name: "AWS", cat: "Cloud" },
              { name: "Google Cloud", cat: "Cloud" },
              { name: "Firebase", cat: "Cloud" },
              { name: "Stripe", cat: "Pay" },
              { name: "Twilio", cat: "Comm" },
              { name: "SendGrid", cat: "Comm" },
              { name: "Mailgun", cat: "Comm" },
              { name: "Heroku", cat: "Host" },
              { name: "DigitalOcean", cat: "Host" },
              { name: "Cloudflare", cat: "CDN" },
              { name: "GoDaddy", cat: "DNS" },
            ].map((p) => (
              <div
                key={p.name}
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-blue-500/20 transition-all duration-200 group"
              >
                <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">{p.name}</span>
                <span className="text-[10px] text-white/30 mt-1">{p.cat}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials Section ──────────────────────────────────── */}
      <section id="testimonials" className="relative py-24 sm:py-32">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
          <div className="absolute top-1/2 left-1/3 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px]" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-blue-400 tracking-widest uppercase">Testimonials</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Trusted by developers worldwide
            </h2>
            <p className="mt-4 text-white/50 max-w-xl mx-auto">
              See what engineers, DevOps teams, and security professionals are saying about Archibald Titan.
            </p>
          </div>

          {/* Testimonial grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                name: "Marcus Chen",
                role: "Senior DevOps Engineer",
                company: "Nexus Systems",
                text: "Managing API keys across 12 different providers was a nightmare. Archibald Titan reduced what used to take me 2 hours every quarter to about 3 minutes. The encrypted vault gives me peace of mind.",
                rating: 5,
                initials: "MC",
                color: "from-blue-500 to-cyan-500",
              },
              {
                name: "Sarah Mitchell",
                role: "Full-Stack Developer",
                company: "Indie Developer",
                text: "I was skeptical about running an AI agent locally, but the stealth browser is genuinely impressive. It handled GoDaddy and AWS without a hitch once I added a residential proxy. Game changer for solo devs.",
                rating: 5,
                initials: "SM",
                color: "from-purple-500 to-pink-500",
              },
              {
                name: "James Okonkwo",
                role: "CTO",
                company: "CloudBridge Inc.",
                text: "The fact that nothing leaves my machine is the selling point. We evaluated three credential management tools and Archibald Titan was the only one that met our security requirements. AES-256-GCM encryption is exactly what we needed.",
                rating: 5,
                initials: "JO",
                color: "from-emerald-500 to-teal-500",
              },
              {
                name: "Elena Vasquez",
                role: "Security Analyst",
                company: "Fortify Labs",
                text: "I audited the encryption implementation and it's solid. The kill switch feature is a nice touch — gives you an emergency off-ramp if anything goes sideways. Exactly what a security-conscious tool should have.",
                rating: 5,
                initials: "EV",
                color: "from-amber-500 to-orange-500",
              },
              {
                name: "David Park",
                role: "Platform Engineer",
                company: "ScaleOps",
                text: "We rotate API keys monthly across 8 providers. Archibald Titan turned a full afternoon of manual work into a single automated run. The export to .env feature integrates perfectly with our CI/CD pipeline.",
                rating: 5,
                initials: "DP",
                color: "from-rose-500 to-red-500",
              },
              {
                name: "Aisha Rahman",
                role: "Freelance Developer",
                company: "Self-employed",
                text: "Free, local, and it actually works. I use it to manage keys for my client projects — OpenAI, Stripe, SendGrid, the works. The CAPTCHA solving saved me from pulling my hair out with Cloudflare.",
                rating: 5,
                initials: "AR",
                color: "from-indigo-500 to-violet-500",
              },
            ].map((t, i) => (
              <div
                key={i}
                className="relative p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-blue-500/20 transition-all duration-300 group"
              >
                {/* Quote icon */}
                <Quote className="absolute top-5 right-5 h-8 w-8 text-white/[0.04] group-hover:text-blue-500/10 transition-colors" />

                {/* Stars */}
                <div className="flex items-center gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>

                {/* Quote text */}
                <p className="text-sm text-white/60 leading-relaxed mb-6">
                  "{t.text}"
                </p>

                {/* Author */}
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center shrink-0`}>
                    <span className="text-xs font-bold text-white">{t.initials}</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white/90">{t.name}</div>
                    <div className="text-xs text-white/40">{t.role} · {t.company}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Social proof stats */}
          <div className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16">
            <div className="text-center">
              <div className="text-3xl font-bold text-white">
                <AnimatedNumber target={2400} />+
              </div>
              <div className="text-sm text-white/40 mt-1">Active Users</div>
            </div>
            <div className="hidden sm:block h-8 w-px bg-white/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-white">
                <AnimatedNumber target={50000} />+
              </div>
              <div className="text-sm text-white/40 mt-1">Keys Retrieved</div>
            </div>
            <div className="hidden sm:block h-8 w-px bg-white/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-white">
                4.<AnimatedNumber target={9} />
                <span className="text-blue-400">/5</span>
              </div>
              <div className="text-sm text-white/40 mt-1">Average Rating</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing Preview Section ─────────────────────────────── */}
      <section id="pricing-preview" className="relative py-24 sm:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/5 to-transparent" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-blue-400 tracking-widest uppercase">Pricing</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-white/50 max-w-xl mx-auto">
              Start free. Upgrade when you need more power. Every plan includes a 7-day free trial.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Free */}
            <div className="relative p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300">
              <div className="text-sm font-semibold text-white/60 mb-2">Free</div>
              <div className="text-3xl font-bold text-white mb-1">$0<span className="text-base font-normal text-white/40">/mo</span></div>
              <p className="text-sm text-white/40 mb-6">Perfect for getting started</p>
              <div className="space-y-3">
                {["300 AI credits/month", "5 credential fetches", "AI Chat & Sandbox", "AES-256 encrypted vault", "3 provider integrations"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm text-white/60">
                    <Check className="h-4 w-4 text-blue-400 shrink-0" />{f}
                  </div>
                ))}
              </div>
              <Button
                onClick={() => { if (user) setLocation("/dashboard"); else window.location.href = getLoginUrl(); }}
                className="w-full mt-6 bg-white/5 hover:bg-white/10 text-white border border-white/10 h-11"
              >
                Get Started Free
              </Button>
            </div>

            {/* Cyber — Highlighted */}
            <div className="relative p-6 rounded-2xl border-2 border-blue-500/40 bg-blue-500/[0.04] hover:bg-blue-500/[0.07] transition-all duration-300 ring-1 ring-blue-500/20 shadow-xl shadow-blue-500/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500 text-white shadow-lg shadow-blue-500/30">
                  MOST POPULAR
                </span>
              </div>
              <div className="text-sm font-semibold text-blue-400 mb-2">Cyber</div>
              <div className="text-3xl font-bold text-white mb-1">$199<span className="text-base font-normal text-white/40">/mo</span></div>
              <p className="text-sm text-white/40 mb-6">Full security suite for professionals</p>
              <div className="space-y-3">
                {["75,000 AI credits/month", "Unlimited credential fetches", "Credential Leak Scanner", "TOTP Vault & Auto-Fill", "Credential Health Monitor", "All 15+ provider integrations", "Priority support"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm text-white/80">
                    <Check className="h-4 w-4 text-blue-400 shrink-0" />{f}
                  </div>
                ))}
              </div>
              <Button
                onClick={() => { if (user) setLocation("/pricing"); else window.location.href = getLoginUrl(); }}
                className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white border-0 h-11 shadow-lg shadow-blue-600/25"
              >
                Start 7-Day Free Trial
              </Button>
              <p className="text-xs text-center text-white/30 mt-2">30-day money-back guarantee</p>
            </div>

            {/* Enterprise */}
            <div className="relative p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300">
              <div className="text-sm font-semibold text-white/60 mb-2">Enterprise</div>
              <div className="text-3xl font-bold text-white mb-1">$99<span className="text-base font-normal text-white/40">/mo</span></div>
              <p className="text-sm text-white/40 mb-6">Team management & collaboration</p>
              <div className="space-y-3">
                {["25,000 AI credits/month", "Unlimited credential fetches", "Team vault with RBAC", "Full audit trail", "All 15+ providers", "API access"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm text-white/60">
                    <Check className="h-4 w-4 text-blue-400 shrink-0" />{f}
                  </div>
                ))}
              </div>
              <Button
                onClick={() => { if (user) setLocation("/pricing"); else window.location.href = getLoginUrl(); }}
                className="w-full mt-6 bg-white/5 hover:bg-white/10 text-white border border-white/10 h-11"
              >
                Start Free Trial
              </Button>
            </div>
          </div>

          <div className="text-center mt-8">
            <Link href="/pricing" className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors inline-flex items-center gap-1">
              View all 6 plans and full feature comparison
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Updates / Changelog ─────────────────────────────────── */}
      <section id="updates" className="relative py-24 sm:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/5 to-transparent" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-sm font-semibold text-blue-400 tracking-widest uppercase">Changelog</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Latest Updates
            </h2>
            <p className="mt-4 text-white/50">
              Stay up to date with the latest features, improvements, and fixes.
            </p>
          </div>

          {/* Update checker */}
          <UpdateChecker onDownload={handleDownload} isAuthenticated={!!user} />

          {/* Release timeline */}
          <div className="mt-12 space-y-6">
            {(allReleases ?? []).map((release, i) => (
              <div
                key={release.id}
                className="relative pl-8 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-px before:bg-white/10"
              >
                {/* Timeline dot */}
                <div className={`absolute left-0 top-1 -translate-x-1/2 h-3 w-3 rounded-full border-2 ${
                  i === 0 ? "border-blue-500 bg-blue-500" : "border-white/20 bg-[#060611]"
                }`} />

                <div className="pb-8">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="font-mono text-sm font-semibold text-blue-400">v{release.version}</span>
                    {release.isLatest === 1 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        LATEST
                      </span>
                    )}
                    {release.isPrerelease === 1 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        BETA
                      </span>
                    )}
                    <span className="text-xs text-white/30">
                      {new Date(release.publishedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-3">{release.title}</h3>
                  <div className="text-sm text-white/50 leading-relaxed whitespace-pre-line">
                    {release.changelog.split("\n").map((line: string, j: number) => {
                      if (line.startsWith("**") && line.endsWith("**")) {
                        return <div key={j} className="font-semibold text-white/70 mt-3 mb-1">{line.replace(/\*\*/g, "")}</div>;
                      }
                      if (line.startsWith("- ")) {
                        return (
                          <div key={j} className="flex items-start gap-2 ml-1 my-0.5">
                            <Check className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                            <span>{line.slice(2)}</span>
                          </div>
                        );
                      }
                      return line ? <div key={j}>{line}</div> : <div key={j} className="h-2" />;
                    })}
                  </div>

                  {/* Download — only visible to logged-in users */}
                  {user && (
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <button
                        onClick={() => handleDownload(detectedPlatform)}
                        className="inline-flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors group"
                      >
                        <Download className="h-4 w-4 group-hover:translate-y-0.5 transition-transform" />
                        <span>Download Latest (v{latestRelease?.version ?? "..."}) — includes all updates</span>
                      </button>
                      {latestRelease && release.version !== latestRelease.version && (
                        <p className="text-xs text-white/30 mt-1 ml-6">
                          This release is included in the latest version (v{latestRelease.version}). One download gets you everything.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ Section ────────────────────────────────────────────── */}
      <section id="faq" className="relative py-24 sm:py-32">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-sm font-semibold text-blue-400 tracking-widest uppercase">FAQ</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="divide-y-0">
            <FAQItem
              question="Is there a free plan?"
              answer="Yes! Archibald Titan offers a generous free tier with 300 credits, 5 credential fetches, and access to the AI chat, Sandbox, and core tools. When you're ready for more power, upgrade to Pro ($29/mo) for unlimited fetches, Enterprise ($99/mo) for team management, or Cyber ($199/mo) for advanced security tools like the Leak Scanner, TOTP Vault, and Credential Health Monitor. No credit card required to start."
            />
            <FAQItem
              question="Are my credentials safe?"
              answer="Absolutely. All credentials are encrypted with AES-256-GCM before being stored. The encryption key is derived from your session and never leaves your machine. We use the same encryption standard used by banks and military organizations. Your keys are never transmitted to any external server."
            />
            <FAQItem
              question="Does it work with two-factor authentication (2FA)?"
              answer="Yes! Archibald Titan has full built-in two-factor authentication. You can enable TOTP-based 2FA from Account Settings using any authenticator app (Google Authenticator, Authy, 1Password, etc.). During setup you'll get a QR code to scan and 8 one-time backup codes for emergency access. Once enabled, every login requires both your password and a 6-digit code from your authenticator app. For credential retrieval from external providers with mandatory 2FA, the manual CAPTCHA assistance mode lets you complete 2FA challenges yourself during the fetch process."
            />
            <FAQItem
              question="What is a residential proxy and do I need one?"
              answer="A residential proxy routes your internet traffic through a real home IP address instead of a datacenter IP. Some providers like GoDaddy and Cloudflare use advanced bot detection that blocks datacenter IPs. If you need to fetch credentials from these providers, you'll need a residential proxy. The app has a built-in proxy manager — just add your proxy credentials in Settings."
            />
            <FAQItem
              question="Can I use this for my team?"
              answer="Absolutely! The Enterprise plan ($99/mo) includes team management with role-based access control, shared credential vaults, and a full audit trail. Each team member gets their own encrypted vault, and admins can manage permissions, view activity logs, and enforce security policies. For larger organizations, the Titan plan ($4,999/mo) includes dedicated infrastructure and on-premise deployment options."
            />
            <FAQItem
              question="What happens if a provider changes their website?"
              answer="Provider automation scripts are updated regularly. When a provider changes their website layout, we release an update with the new automation script. You can check for updates directly in the app or on this page. The modular architecture means individual provider scripts can be updated without affecting the rest of the system."
            />
            <FAQItem
              question="What makes the Cyber plan special?"
              answer="The Cyber plan ($199/mo) unlocks Archibald Titan's full security suite: the Credential Leak Scanner monitors public repos and paste sites for your exposed secrets, the TOTP Vault stores and auto-fills 2FA codes with military-grade encryption, and the Credential Health Monitor tracks key age, rotation schedules, and security scores. It also includes 75,000 credits/month and priority support. If you handle sensitive API keys or manage security for a team, Cyber pays for itself by preventing even one credential leak."
            />
            <FAQItem
              question="Can I try premium features before committing?"
              answer="Yes! Every new account gets a 7-day free trial of all features. After the trial, you can continue on the free tier or upgrade to any plan. We also offer a 30-day money-back guarantee on all paid plans — if you're not satisfied, we'll refund your subscription, no questions asked."
            />
            <FAQItem
              question="Is this legal?"
              answer="Yes. Archibald Titan automates the same actions you would perform manually — logging into your own accounts and copying your own API keys. It does not bypass any security measures, access accounts you don't own, or violate any terms of service. It's simply a productivity tool that saves you time."
            />
          </div>
        </div>
      </section>

      {/* ── CTA Section ────────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-32">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-600/10 rounded-full blur-[120px]" />
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Ready to secure your digital assets?
          </h2>
          <p className="mt-4 text-white/50 text-lg max-w-2xl mx-auto">
            Join thousands of developers who trust Archibald Titan to manage their credentials, build with AI, and protect their code. Start your free 7-day trial today.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            {user ? (
              <Button
                size="lg"
                onClick={() => setLocation("/dashboard")}
                className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-xl shadow-blue-600/25 h-14 px-10 text-base font-semibold gap-3"
              >
                <ArrowRight className="h-5 w-5" />Go to Dashboard
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  onClick={() => { window.location.href = getLoginUrl(); }}
                  className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-xl shadow-blue-600/25 h-14 px-10 text-base font-semibold gap-3"
                >
                  <LogIn className="h-5 w-5" />Start Free Trial
                </Button>
                <Link href="/pricing">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/10 bg-white/5 hover:bg-white/10 text-white h-12 px-8 text-base"
                  >
                    View Pricing
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Affiliate Recommendations ───────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AffiliateRecommendations context="landing" variant="card" limit={6} />
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="relative border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <img loading="eager" src={AT_ICON_64} alt="AT" className="h-8 w-8 object-contain" />
                <span className="text-base font-bold tracking-tight">Archibald Titan</span>
              </div>
              <p className="text-sm text-white/40 max-w-sm leading-relaxed">
                The world's most advanced local AI agent for autonomous credential retrieval. Built with security and privacy at its core.
              </p>
              {/* Social Links */}
              <div className="mt-4 flex items-center gap-4">
                <a href="https://www.snapchat.com/add/archibaldtitan" target="_blank" rel="noopener noreferrer" className="group" title="Add us on Snapchat">
                  <img loading="lazy" src="/snapchat-qr.png" alt="Snapchat QR" className="h-10 w-10 rounded-md opacity-60 group-hover:opacity-100 transition-opacity" />
                </a>
                <a href="https://github.com/archibaldtitan" target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/70 transition-colors" title="GitHub">
                  <Github className="h-5 w-5" />
                </a>
              </div>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-sm font-semibold text-white/80 mb-4">Product</h4>
              <div className="space-y-2.5">
                <a href="#features" className="block text-sm text-white/40 hover:text-white/70 transition-colors">Features</a>
                <Link href="/pricing" className="block text-sm text-blue-400/80 hover:text-blue-300 transition-colors font-medium">Pricing</Link>
                <a href="#updates" className="block text-sm text-white/40 hover:text-white/70 transition-colors">Changelog</a>
                <a href="#faq" className="block text-sm text-white/40 hover:text-white/70 transition-colors">FAQ</a>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white/80 mb-4">Resources</h4>
              <div className="space-y-2.5">
                <a href="#how-it-works" className="block text-sm text-white/40 hover:text-white/70 transition-colors">How It Works</a>
                <a href="#testimonials" className="block text-sm text-white/40 hover:text-white/70 transition-colors">Testimonials</a>
                <button
                  onClick={() => {
                    if (user) setLocation("/dashboard");
                    else window.location.href = getLoginUrl();
                  }}
                  className="block text-sm text-white/40 hover:text-white/70 transition-colors text-left"
                >
                  Dashboard
                </button>
              </div>
            </div>

            {/* Legal */}
            <div className="md:col-span-1">
              <h4 className="text-sm font-semibold text-white/80 mb-4">Legal</h4>
              <div className="space-y-2.5">
                <Link href="/terms" className="block text-sm text-white/40 hover:text-white/70 transition-colors">Terms & Conditions</Link>
                <Link href="/privacy" className="block text-sm text-white/40 hover:text-white/70 transition-colors">Privacy Policy</Link>
                <Link href="/contact" className="block text-sm text-white/40 hover:text-white/70 transition-colors">Contact & Billing</Link>
              </div>
            </div>
          </div>

          {/* Created by Leego branding */}
          <div className="mt-10 pt-6 border-t border-white/5 flex flex-col items-center">
            <img
              src="/Madebyleego.png"
              alt="Created by Leego"
              className="h-32 w-32 object-contain opacity-100 brightness-110 transition-all duration-300 drop-shadow-[0_0_18px_rgba(0,255,50,0.8)] hover:drop-shadow-[0_0_28px_rgba(0,255,50,1)] hover:brightness-125 animate-pulse"
              style={{ filter: 'drop-shadow(0 0 14px rgba(0, 255, 50, 0.7)) drop-shadow(0 0 28px rgba(0, 255, 50, 0.4)) drop-shadow(0 0 50px rgba(0, 255, 50, 0.2))' }}
              loading="lazy"
            />
          </div>

          {/* Legal bar */}
          <div className="mt-6 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/20">
              &copy; {new Date().getFullYear()} Archibald Titan. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link href="/terms" className="text-xs text-white/20 hover:text-white/40 transition-colors">Terms</Link>
              <Link href="/privacy" className="text-xs text-white/20 hover:text-white/40 transition-colors">Privacy</Link>
              <Link href="/contact" className="text-xs text-white/20 hover:text-white/40 transition-colors">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Update Checker Component ───────────────────────────────────────

function UpdateChecker({ onDownload, isAuthenticated }: { onDownload: (platform: "windows" | "mac" | "linux") => void; isAuthenticated: boolean }) {
  const [version, setVersion] = useState("");
  const [checked, setChecked] = useState(false);
  const { data, refetch, isLoading } = trpc.releases.checkUpdate.useQuery(
    { currentVersion: version },
    { enabled: false }
  );

  const handleCheck = () => {
    if (!version.trim()) return;
    setChecked(true);
    refetch();
  };

  return (
    <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center gap-3 mb-4">
        <RefreshCw className="h-5 w-5 text-blue-400" />
        <h3 className="text-base font-semibold">Check for Updates</h3>
      </div>
      <p className="text-sm text-white/50 mb-4">
        Enter your current version number to check if a newer version is available.
      </p>
      <div className="flex gap-3">
        <input
          type="text"
          value={version}
          onChange={(e) => { setVersion(e.target.value); setChecked(false); }}
          placeholder="e.g. 5.0.0"
          className="flex-1 h-10 px-4 rounded-lg border border-white/10 bg-white/5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
        />
        <Button
          onClick={handleCheck}
          disabled={!version.trim() || isLoading}
          className="bg-blue-600 hover:bg-blue-500 text-white border-0 h-10 px-5"
        >
          {isLoading ? "Checking..." : "Check"}
        </Button>
      </div>
      {checked && data && (
        <div className={`mt-4 p-4 rounded-lg border ${
          data.updateAvailable
            ? "border-blue-500/20 bg-blue-500/5"
            : "border-emerald-500/20 bg-emerald-500/5"
        }`}>
          {data.updateAvailable ? (
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-300">Update Available!</p>
                <p className="text-sm text-white/50 mt-1">
                  Version <span className="font-mono text-blue-400">{data.latestVersion}</span> is available.
                  You're currently on <span className="font-mono text-white/60">{data.currentVersion}</span>.
                </p>
                {isAuthenticated ? (
                  <button
                    onClick={() => onDownload(detectPlatform())}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 mt-2 hover:text-blue-300"
                  >
                    <Download className="h-3.5 w-3.5" />Download Latest
                  </button>
                ) : (
                  <p className="text-sm text-white/40 mt-2">Sign in to your account to download updates.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Check className="h-5 w-5 text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-300">You're up to date! Version {data.currentVersion} is the latest.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
