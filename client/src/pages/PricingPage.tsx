import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import AffiliateRecommendations from "@/components/AffiliateRecommendations";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { trackViewContent, trackPurchase } from "@/lib/adTracking";
import { useState, useEffect } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { toast } from "sonner";
import {
  Check,
  X,
  Zap,
  Shield,
  Crown,
  ArrowRight,
  Sparkles,
  ChevronLeft,
  Loader2,
  CreditCard,
  ExternalLink,
} from "lucide-react";
import { PRICING_TIERS, type PlanId, type PricingTier } from "@shared/pricing";
import { TitanLogo } from "@/components/TitanLogo";

// ─── Pricing Toggle ─────────────────────────────────────────────────

function BillingToggle({
  interval,
  setInterval,
}: {
  interval: "month" | "year";
  setInterval: (v: "month" | "year") => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4 mb-12">
      <span
        className={`text-sm font-medium transition-colors ${
          interval === "month" ? "text-white" : "text-white/40"
        }`}
      >
        Monthly
      </span>
      <button
        onClick={() => setInterval(interval === "month" ? "year" : "month")}
        className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
          interval === "year"
            ? "bg-blue-600"
            : "bg-white/10 border border-white/20"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 ${
            interval === "year" ? "translate-x-7" : "translate-x-0"
          }`}
        />
      </button>
      <span
        className={`text-sm font-medium transition-colors ${
          interval === "year" ? "text-white" : "text-white/40"
        }`}
      >
        Yearly
      </span>
      {interval === "year" && (
        <span className="ml-1 px-2.5 py-0.5 text-xs font-bold bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
          Save 17%
        </span>
      )}
    </div>
  );
}

// ─── Tier Card ──────────────────────────────────────────────────────

function TierCard({
  tier,
  interval,
  currentPlan,
  isAuthenticated,
  onSubscribe,
  isLoading,
}: {
  tier: PricingTier;
  interval: "month" | "year";
  currentPlan: PlanId;
  isAuthenticated: boolean;
  onSubscribe: (planId: PlanId) => void;
  isLoading: boolean;
}) {
  const price = interval === "month" ? tier.monthlyPrice : tier.yearlyPrice;
  const isCurrentPlan = currentPlan === tier.id;
  const isFree = tier.id === "free";
  const isHighlighted = tier.highlighted;

  const icons: Record<string, React.ReactNode> = {
    free: <Shield className="w-6 h-6" />,
    pro: <Zap className="w-6 h-6" />,
    enterprise: <Crown className="w-6 h-6" />,
    cyber: <Shield className="w-6 h-6" />,
  };

  const gradients: Record<string, string> = {
    free: "from-slate-500/20 to-slate-600/5",
    pro: "from-blue-600/30 to-indigo-600/10",
    enterprise: "from-purple-600/20 to-pink-600/5",
    cyber: "from-red-600/30 to-orange-600/10",
  };

  const borderColors: Record<string, string> = {
    free: "border-white/5 hover:border-white/10",
    pro: "border-blue-500/40 hover:border-blue-400/60",
    enterprise: "border-white/5 hover:border-purple-500/30",
    cyber: "border-red-500/40 hover:border-red-400/60",
  };

  return (
    <div
      className={`relative flex flex-col rounded-2xl border backdrop-blur-sm transition-all duration-300 ${
        borderColors[tier.id]
      } bg-gradient-to-b ${gradients[tier.id]} ${
        isHighlighted
          ? "scale-[1.02] shadow-2xl shadow-blue-500/10 ring-1 ring-blue-500/20"
          : ""
      }`}
    >
      {/* Popular badge */}
      {isHighlighted && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 px-4 py-1 text-xs font-bold bg-blue-600 text-white rounded-full shadow-lg shadow-blue-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            Most Popular
          </span>
        </div>
      )}

      <div className="p-8 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div
            className={`p-2 rounded-lg ${
              isHighlighted
                ? "bg-blue-500/20 text-blue-400"
                : tier.id === "cyber"
                ? "bg-red-500/20 text-red-400"
                : tier.id === "enterprise"
                ? "bg-purple-500/20 text-purple-400"
                : "bg-white/5 text-white/60"
            }`}
          >
            {icons[tier.id]}
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">{tier.name}</h3>
          </div>
        </div>
        <p className="text-sm text-white/50 mb-6">{tier.tagline}</p>

        {/* Price */}
        <div className="mb-8">
          {isFree ? (
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-extrabold text-white tracking-tight">
                $0
              </span>
              <span className="text-white/40 text-sm">/forever</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-extrabold text-white tracking-tight">
                ${price}
              </span>
              <span className="text-white/40 text-sm">
                /{interval === "month" ? "mo" : "yr"}
              </span>
            </div>
          )}
          {!isFree && interval === "year" && (
            <p className="text-xs text-green-400 mt-1.5">
              ${Math.round(price / 12)}/mo billed annually
            </p>
          )}
        </div>

        {/* CTA Button */}
        <div className="mb-8">
          {isCurrentPlan ? (
            <Button
              disabled
              className="w-full h-12 text-sm font-semibold bg-white/5 text-white/40 border border-white/10"
            >
              Current Plan
            </Button>
          ) : isFree ? (
            isAuthenticated ? (
              <Button
                disabled
                className="w-full h-12 text-sm font-semibold bg-white/5 text-white/50 border border-white/10"
              >
                Included Free
              </Button>
            ) : (
              <Button
                onClick={() => (window.location.href = getLoginUrl())}
                className="w-full h-12 text-sm font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )
          ) : tier.id === "enterprise" ? (
            <Button
              onClick={() => (window.location.href = "/contact")}
              className="w-full h-12 text-sm font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white border-0 shadow-lg shadow-purple-500/20"
            >
              Contact Sales
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={() => onSubscribe(tier.id)}
              disabled={isLoading}
              className="w-full h-12 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-500/25"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {tier.cta}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>

        {/* Features */}
        <div className="flex-1">
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-4">
            {isFree
              ? "What's included"
              : tier.id === "enterprise"
              ? "Everything in Pro, plus"
              : "Everything in Free, plus"}
          </p>
          <ul className="space-y-3">
            {tier.features.map((feature, i) => (
              <li key={i} className="flex items-start gap-3">
                <Check
                  className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                    isHighlighted
                      ? "text-blue-400"
                      : tier.id === "enterprise"
                      ? "text-purple-400"
                      : "text-green-400/70"
                  }`}
                />
                <span className="text-sm text-white/70">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Comparison Table ───────────────────────────────────────────────

const comparisonFeatures = [
  { name: "Fetches per month", free: "5", pro: "Unlimited", enterprise: "Unlimited" },
  { name: "Providers", free: "3", pro: "15+", enterprise: "15+ & custom" },
  { name: "Credential storage", free: "25", pro: "Unlimited", enterprise: "Unlimited" },
  { name: "Proxy slots", free: "—", pro: "5", enterprise: "Unlimited" },
  { name: "Export formats", free: "JSON", pro: "JSON, .ENV", enterprise: "JSON, .ENV, CSV, API" },
  { name: "CAPTCHA solving", free: false, pro: true, enterprise: true },
  { name: "Kill switch", free: false, pro: true, enterprise: true },
  { name: "Scheduled fetches", free: false, pro: true, enterprise: true },
  { name: "Team management", free: false, pro: false, enterprise: true },
  { name: "API access", free: false, pro: false, enterprise: true },
  { name: "SSO / SAML", free: false, pro: false, enterprise: true },
  { name: "Audit logs", free: false, pro: false, enterprise: true },
  { name: "SLA guarantee", free: false, pro: false, enterprise: true },
  { name: "Support", free: "Community", pro: "Priority email", enterprise: "Dedicated manager" },
];

function ComparisonTable() {
  return (
    <div className="mt-24 max-w-5xl mx-auto">
      <h2 className="text-3xl font-bold text-center text-white mb-2">
        Compare Plans
      </h2>
      <p className="text-center text-white/40 mb-10">
        See exactly what you get with each tier
      </p>
      <div className="overflow-x-auto rounded-xl border border-white/5 bg-white/[0.02]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left py-4 px-6 text-white/40 font-medium">
                Feature
              </th>
              <th className="text-center py-4 px-6 text-white/60 font-semibold">
                Free
              </th>
              <th className="text-center py-4 px-6 text-blue-400 font-semibold">
                Pro
              </th>
              <th className="text-center py-4 px-6 text-purple-400 font-semibold">
                Enterprise
              </th>
            </tr>
          </thead>
          <tbody>
            {comparisonFeatures.map((feature, i) => (
              <tr
                key={i}
                className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
              >
                <td className="py-3.5 px-6 text-white/70">{feature.name}</td>
                {(["free", "pro", "enterprise"] as const).map((plan) => {
                  const val = feature[plan];
                  return (
                    <td key={plan} className="text-center py-3.5 px-6">
                      {typeof val === "boolean" ? (
                        val ? (
                          <Check className="w-4 h-4 text-green-400 mx-auto" />
                        ) : (
                          <X className="w-4 h-4 text-white/15 mx-auto" />
                        )
                      ) : (
                        <span className="text-white/60">{val}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── FAQ Section ────────────────────────────────────────────────────

const pricingFaqs = [
  {
    q: "Can I switch plans at any time?",
    a: "Yes. You can upgrade or downgrade your plan at any time. When upgrading, you'll be charged the prorated difference. When downgrading, you'll receive credit toward your next billing cycle.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit and debit cards (Visa, Mastercard, American Express) through our secure Stripe payment processor. We also support Apple Pay and Google Pay.",
  },
  {
    q: "Is there a free trial for Pro?",
    a: "The Free tier lets you try the core functionality with 5 fetches per month. If you need more, you can upgrade to Pro at any time — no trial needed since you can cancel anytime.",
  },
  {
    q: "What happens if I cancel my subscription?",
    a: "Your subscription remains active until the end of the current billing period. After that, your account reverts to the Free tier. All your stored credentials remain encrypted and accessible.",
  },

];

function PricingFaq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="mt-24 max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-center text-white mb-2">
        Frequently Asked Questions
      </h2>
      <p className="text-center text-white/40 mb-10">
        Everything you need to know about our pricing
      </p>
      <div className="space-y-3">
        {pricingFaqs.map((faq, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden"
          >
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between p-5 text-left"
            >
              <span className="text-sm font-medium text-white/80">
                {faq.q}
              </span>
              <span
                className={`text-white/30 transition-transform duration-200 ${
                  open === i ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            </button>
            {open === i && (
              <div className="px-5 pb-5 -mt-1">
                <p className="text-sm text-white/50 leading-relaxed">
                  {faq.a}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Pricing Page ──────────────────────────────────────────────

export default function PricingPage() {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const searchString = useSearch();

  // Get subscription status
  const { data: subscription } = trpc.stripe.getSubscription.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const currentPlan: PlanId = subscription?.plan || "free";

  // Track pricing page view for ad platforms
  useEffect(() => {
    trackViewContent("Pricing Page");
  }, []);

  // Stripe checkout mutation
  const createCheckout = trpc.stripe.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        toast.info("Redirecting to Stripe checkout...");
        window.open(data.url, "_blank");
      }
      setLoadingPlan(null);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create checkout session");
      setLoadingPlan(null);
    },
  });

  // Manage subscription mutation
  const createPortal = trpc.stripe.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, "_blank");
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to open billing portal");
    },
  });

  // Handle success/cancel URL params
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("success") === "true") {
      toast.success("Payment successful! Your subscription is now active.", {
        duration: 6000,
      });
      // Track purchase conversion for ad platforms
      trackPurchase({ value: 29, currency: "USD", planName: "Pro" });
      // Clean URL
      navigate("/pricing", { replace: true });
    } else if (params.get("canceled") === "true") {
      toast.info("Checkout was canceled. No charges were made.");
      navigate("/pricing", { replace: true });
    }
  }, [searchString, navigate]);

  const handleSubscribe = (planId: PlanId) => {
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }
    if (planId === "free") return;
    setLoadingPlan(planId);
    createCheckout.mutate({
      planId: planId as "pro" | "enterprise",
      interval,
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white">
      {/* Nav */}
      <nav aria-label="Navigation" className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a14]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <TitanLogo size="sm" />
            </div>
            <span className="text-lg font-bold text-white">
              Archibald Titan
            </span>
          </Link>
          <div className="flex items-center gap-4">
            {currentPlan !== "free" && isAuthenticated && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => createPortal.mutate()}
                className="text-white/60 border-white/10 hover:bg-white/5"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Manage Billing
              </Button>
            )}
            {isAuthenticated ? (
              <Button
                onClick={() => navigate("/dashboard")}
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                Dashboard
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => (window.location.href = getLoginUrl())}
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-8 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Simple, transparent pricing
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4">
            Choose Your{" "}
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              Power Level
            </span>
          </h1>
          <p className="text-lg text-white/40 max-w-2xl mx-auto mb-4">
            Start free and scale as you grow. All plans include military-grade
            encryption and zero cloud dependency.
          </p>
          {isAuthenticated && currentPlan !== "free" && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium">
              <Check className="w-4 h-4" />
              You're on the{" "}
              <span className="font-bold capitalize">{currentPlan}</span> plan
            </div>
          )}
        </div>
      </section>

      {/* Toggle */}
      <section className="px-6">
        <BillingToggle interval={interval} setInterval={setInterval} />
      </section>

      {/* Tier Cards */}
      <section className="px-6 pb-16">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {PRICING_TIERS.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              interval={interval}
              currentPlan={currentPlan}
              isAuthenticated={isAuthenticated}
              onSubscribe={handleSubscribe}
              isLoading={loadingPlan === tier.id}
            />
          ))}
        </div>
      </section>



      {/* Comparison Table */}
      <section className="px-6 pb-16">
        <ComparisonTable />
      </section>

      {/* FAQ */}
      <section className="px-6 pb-24">
        <PricingFaq />
      </section>

      {/* Partner Recommendations */}
      <section className="px-6 pb-16">
        <div className="max-w-4xl mx-auto">
          <AffiliateRecommendations context="subscription" variant="card" limit={3} />
        </div>
      </section>



      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-white/30 text-sm">
            <TitanLogo size="sm" />
            <span>
              &copy; {new Date().getFullYear()} Archibald Titan. All rights
              reserved.
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/30">
            <Link href="/terms" className="hover:text-white/60 transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white/60 transition-colors">
              Privacy
            </Link>
            <Link href="/contact" className="hover:text-white/60 transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
