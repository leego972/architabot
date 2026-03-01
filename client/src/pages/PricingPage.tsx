import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import AffiliateRecommendations from "@/components/AffiliateRecommendations";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { trackViewContent, trackPurchase } from "@/lib/adTracking";
import { TIER_LOGOS } from "@/lib/logos";
import { TitanLogo } from "@/components/TitanLogo";
import { useState, useEffect } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { toast } from "sonner";
import {
  Check,
  X,
  ArrowRight,
  Sparkles,
  Loader2,
  CreditCard,
  ChevronDown,
} from "lucide-react";
import {
  PRICING_TIERS,
  COMPARISON_FEATURES,
  type PlanId,
  type PricingTier,
} from "@shared/pricing";

// ─── Billing Toggle ─────────────────────────────────────────────────

function BillingToggle({
  interval,
  setInterval,
}: {
  interval: "month" | "year";
  setInterval: (v: "month" | "year") => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4 mb-12">
      <span className={`text-sm font-medium transition-colors ${interval === "month" ? "text-white" : "text-white/40"}`}>
        Monthly
      </span>
      <button
        onClick={() => setInterval(interval === "month" ? "year" : "month")}
        className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
          interval === "year" ? "bg-blue-600" : "bg-white/10 border border-white/20"
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 ${
          interval === "year" ? "translate-x-7" : "translate-x-0"
        }`} />
      </button>
      <span className={`text-sm font-medium transition-colors ${interval === "year" ? "text-white" : "text-white/40"}`}>
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

const gradients: Record<string, string> = {
  free: "from-emerald-500/20 to-emerald-600/5",
  pro: "from-blue-600/30 to-indigo-600/10",
  enterprise: "from-blue-500/20 to-cyan-600/5",
  cyber: "from-cyan-500/20 to-teal-600/10",
  cyber_plus: "from-purple-600/25 to-indigo-600/10",
  titan: "from-orange-500/20 to-amber-600/10",
};

const borderColors: Record<string, string> = {
  free: "border-emerald-500/20 hover:border-emerald-400/40",
  pro: "border-blue-500/40 hover:border-blue-400/60",
  enterprise: "border-blue-400/20 hover:border-blue-400/40",
  cyber: "border-cyan-500/30 hover:border-cyan-400/50",
  cyber_plus: "border-purple-500/40 hover:border-purple-400/60",
  titan: "border-orange-500/40 hover:border-orange-400/60",
};

const accentColors: Record<string, string> = {
  free: "text-emerald-400",
  pro: "text-blue-400",
  enterprise: "text-blue-300",
  cyber: "text-cyan-400",
  cyber_plus: "text-purple-400",
  titan: "text-orange-400",
};

const ctaStyles: Record<string, string> = {
  free: "bg-white/10 hover:bg-white/15 text-white border border-white/10",
  pro: "bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-500/25",
  enterprise: "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white border-0 shadow-lg shadow-blue-500/20",
  cyber: "bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white border-0 shadow-lg shadow-cyan-500/20",
  cyber_plus: "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border-0 shadow-lg shadow-purple-500/20",
  titan: "bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white border-0 shadow-lg shadow-orange-500/20",
};

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
  const isContactSales = tier.id === "titan";
  const tierLogo = TIER_LOGOS[tier.id];

  // Show max 8 features on card, rest visible in comparison table
  const displayFeatures = tier.features.slice(0, 10);
  const moreCount = tier.features.length - displayFeatures.length;

  return (
    <div className={`relative flex flex-col rounded-2xl border backdrop-blur-sm transition-all duration-300 ${
      borderColors[tier.id] || borderColors.free
    } bg-gradient-to-b ${gradients[tier.id] || gradients.free} ${
      isHighlighted ? "scale-[1.02] shadow-2xl shadow-blue-500/10 ring-1 ring-blue-500/20" : ""
    }`}>
      {/* Popular badge */}
      {isHighlighted && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 px-4 py-1 text-xs font-bold bg-blue-600 text-white rounded-full shadow-lg shadow-blue-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            Most Popular
          </span>
        </div>
      )}

      <div className="p-6 sm:p-8 flex-1 flex flex-col">
        {/* Header with tier logo */}
        <div className="flex items-center gap-3 mb-2">
          {tierLogo && (
            <img src={tierLogo} alt={tier.name} className="w-10 h-10 object-contain" draggable={false} />
          )}
          <div>
            <h3 className="text-xl font-bold text-white">{tier.name}</h3>
          </div>
        </div>
        <p className="text-sm text-white/50 mb-5">{tier.tagline}</p>

        {/* Price */}
        <div className="mb-6">
          {isFree ? (
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-white tracking-tight">$0</span>
              <span className="text-white/40 text-sm">/forever</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-white tracking-tight">${price.toLocaleString()}</span>
              <span className="text-white/40 text-sm">/{interval === "month" ? "mo" : "yr"}</span>
            </div>
          )}
          {!isFree && interval === "year" && (
            <p className="text-xs text-green-400 mt-1.5">
              ${Math.round(price / 12).toLocaleString()}/mo billed annually
            </p>
          )}
        </div>

        {/* CTA Button */}
        <div className="mb-6">
          {isCurrentPlan ? (
            <Button disabled className="w-full h-11 text-sm font-semibold bg-white/5 text-white/40 border border-white/10">
              Current Plan
            </Button>
          ) : isFree ? (
            isAuthenticated ? (
              <Button disabled className="w-full h-11 text-sm font-semibold bg-white/5 text-white/50 border border-white/10">
                Included Free
              </Button>
            ) : (
              <Button onClick={() => (window.location.href = getLoginUrl())}
                className={`w-full h-11 text-sm font-semibold ${ctaStyles.free}`}>
                Get Started Free <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )
          ) : isContactSales ? (
            <Button onClick={() => (window.location.href = "/contact")}
              className={`w-full h-11 text-sm font-semibold ${ctaStyles[tier.id] || ctaStyles.enterprise}`}>
              {tier.cta} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={() => onSubscribe(tier.id)} disabled={isLoading}
              className={`w-full h-11 text-sm font-semibold ${ctaStyles[tier.id] || ctaStyles.pro}`}>
              {isLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
              ) : (
                <>{tier.cta} <ArrowRight className="w-4 h-4 ml-2" /></>
              )}
            </Button>
          )}
        </div>

        {/* Features */}
        <div className="flex-1">
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">
            {isFree ? "What's included" : `Everything in ${getPreviousTierName(tier.id)}, plus`}
          </p>
          <ul className="space-y-2.5">
            {displayFeatures.map((feature, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${accentColors[tier.id] || "text-green-400/70"}`} />
                <span className="text-sm text-white/70">{feature}</span>
              </li>
            ))}
          </ul>
          {moreCount > 0 && (
            <p className="text-xs text-white/30 mt-3 flex items-center gap-1">
              <ChevronDown className="w-3 h-3" />
              +{moreCount} more — see comparison below
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function getPreviousTierName(id: PlanId): string {
  const order: PlanId[] = ["free", "pro", "enterprise", "cyber", "cyber_plus", "titan"];
  const idx = order.indexOf(id);
  if (idx <= 0) return "Free";
  const prev = PRICING_TIERS.find((t) => t.id === order[idx - 1]);
  return prev?.name || "previous tier";
}

// ─── Data-Driven Comparison Table ──────────────────────────────────
// Reads from COMPARISON_FEATURES in shared/pricing.ts so adding a feature
// there automatically shows it here.

const PLAN_ORDER: PlanId[] = ["free", "pro", "enterprise", "cyber", "cyber_plus", "titan"];
const PLAN_HEADER_COLORS: Record<string, string> = {
  free: "text-emerald-400",
  pro: "text-blue-400",
  enterprise: "text-blue-300",
  cyber: "text-cyan-400",
  cyber_plus: "text-purple-400",
  titan: "text-orange-400",
};

function ComparisonTable() {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Group features by category
  const categories = COMPARISON_FEATURES.reduce<Record<string, typeof COMPARISON_FEATURES>>((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {});

  const allCategories = Object.keys(categories);

  // Start with all expanded
  useEffect(() => {
    setExpandedCategories(new Set(allCategories));
  }, []);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="mt-24 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold text-center text-white mb-2">Compare All Plans</h2>
      <p className="text-center text-white/40 mb-10">
        Every feature across every tier — all driven from one config
      </p>
      <div className="overflow-x-auto rounded-xl border border-white/5 bg-white/[0.02]">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="sticky top-0 z-10 bg-[#0a0a14]/95 backdrop-blur-sm">
            <tr className="border-b border-white/10">
              <th className="text-left py-4 px-5 text-white/40 font-medium w-[220px]">Feature</th>
              {PLAN_ORDER.map((plan) => {
                const tier = PRICING_TIERS.find((t) => t.id === plan);
                const logo = TIER_LOGOS[plan];
                return (
                  <th key={plan} className="text-center py-4 px-3">
                    <div className="flex flex-col items-center gap-1.5">
                      {logo && <img src={logo} alt={tier?.name} className="w-7 h-7 object-contain" />}
                      <span className={`font-semibold text-xs ${PLAN_HEADER_COLORS[plan] || "text-white/60"}`}>
                        {tier?.name || plan}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {allCategories.map((category) => {
              const isExpanded = expandedCategories.has(category);
              return (
                <CategorySection
                  key={category}
                  category={category}
                  features={categories[category]}
                  isExpanded={isExpanded}
                  onToggle={() => toggleCategory(category)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategorySection({
  category,
  features,
  isExpanded,
  onToggle,
}: {
  category: string;
  features: typeof COMPARISON_FEATURES;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {/* Category header row */}
      <tr
        className="border-b border-white/5 cursor-pointer hover:bg-white/[0.03] transition-colors"
        onClick={onToggle}
      >
        <td colSpan={7} className="py-3 px-5">
          <div className="flex items-center gap-2">
            <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
            <span className="text-xs font-bold text-white/50 uppercase tracking-wider">{category}</span>
            <span className="text-xs text-white/20">({features.length})</span>
          </div>
        </td>
      </tr>
      {/* Feature rows */}
      {isExpanded && features.map((feature, i) => (
        <tr key={`${category}-${i}`} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
          <td className="py-3 px-5 text-white/70 text-sm">{feature.name}</td>
          {PLAN_ORDER.map((plan) => {
            const val = feature[plan];
            return (
              <td key={plan} className="text-center py-3 px-3">
                {typeof val === "boolean" ? (
                  val ? (
                    <Check className="w-4 h-4 text-green-400 mx-auto" />
                  ) : (
                    <X className="w-4 h-4 text-white/10 mx-auto" />
                  )
                ) : (
                  <span className="text-white/60 text-xs">{val}</span>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
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
    a: "The Free tier lets you try the core functionality with 5 fetches per month and 300 credits. If you need more, you can upgrade to Pro at any time — no trial needed since you can cancel anytime.",
  },
  {
    q: "What happens if I cancel my subscription?",
    a: "Your subscription remains active until the end of the current billing period. After that, your account reverts to the Free tier. All your stored credentials remain encrypted and accessible.",
  },
  {
    q: "What are credits and how do they work?",
    a: "Credits are the universal currency for AI-powered actions in Archibald Titan. Chat messages cost 1 credit, builder actions cost 3, fetches cost 1, and premium features like website cloning cost more. Credits refresh monthly with your plan, and you can buy top-up packs if you run out.",
  },
  {
    q: "Do new features automatically appear in my plan?",
    a: "Yes! When we add new features, they're automatically included in the appropriate tier. Your plan features are always up-to-date — no action needed from you.",
  },
  {
    q: "What's the difference between Cyber and Cyber+?",
    a: "Cyber unlocks the full cybersecurity arsenal: TOTP Vault, Leak Scanner, Credential Health, threat modeling, and red team tools. Cyber+ adds the exclusive Website Clone Engine, unlimited team seats, offensive security tooling, custom AI model fine-tuning, and dedicated infrastructure.",
  },
];

function PricingFaq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="mt-24 max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-center text-white mb-2">Frequently Asked Questions</h2>
      <p className="text-center text-white/40 mb-10">Everything you need to know about our pricing</p>
      <div className="space-y-3">
        {pricingFaqs.map((faq, i) => (
          <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between p-5 text-left">
              <span className="text-sm font-medium text-white/80">{faq.q}</span>
              <span className={`text-white/30 transition-transform duration-200 ${open === i ? "rotate-180" : ""}`}>▾</span>
            </button>
            {open === i && (
              <div className="px-5 pb-5 -mt-1">
                <p className="text-sm text-white/50 leading-relaxed">{faq.a}</p>
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

  const { data: subscription } = trpc.stripe.getSubscription.useQuery(undefined, { enabled: isAuthenticated });
  const currentPlan: PlanId = subscription?.plan || "free";

  useEffect(() => { trackViewContent("Pricing Page"); }, []);

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

  const createPortal = trpc.stripe.createPortalSession.useMutation({
    onSuccess: (data) => { if (data.url) window.open(data.url, "_blank"); },
    onError: (err) => { toast.error(err.message || "Failed to open billing portal"); },
  });

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("success") === "true") {
      toast.success("Payment successful! Your subscription is now active.", { duration: 6000 });
      trackPurchase({ value: 29, currency: "USD", planName: "Pro" });
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

  // Split tiers: Free, Pro, Cyber as main (above fold); Enterprise, Cyber+, Titan as advanced
  const mainTiers = PRICING_TIERS.filter((t) => ["free", "pro", "cyber"].includes(t.id));
  const advancedTiers = PRICING_TIERS.filter((t) => ["enterprise", "cyber_plus", "titan"].includes(t.id));

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white">
      {/* Nav */}
      <nav aria-label="Navigation" className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a14]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <TitanLogo size="sm" />
            <span className="text-lg font-bold text-white">Archibald Titan</span>
          </Link>
          <div className="flex items-center gap-4">
            {currentPlan !== "free" && isAuthenticated && (
              <Button variant="outline" size="sm" onClick={() => createPortal.mutate()}
                className="text-white/60 border-white/10 hover:bg-white/5">
                <CreditCard className="w-4 h-4 mr-2" />Manage Billing
              </Button>
            )}
            {isAuthenticated ? (
              <Button onClick={() => navigate("/dashboard")} size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-white">
                Dashboard <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={() => (window.location.href = getLoginUrl())} size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-white">
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
            Start free and scale as you grow. All plans include AES-256 encryption and AI-powered tools. Upgrade to <span className="text-cyan-400 font-medium">Cyber</span> for the full security suite.
          </p>
          {isAuthenticated && currentPlan !== "free" && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium">
              <Check className="w-4 h-4" />
              You're on the <span className="font-bold capitalize">{currentPlan.replace("_", " ")}</span> plan
            </div>
          )}
        </div>
      </section>

      {/* Toggle */}
      <section className="px-6">
        <BillingToggle interval={interval} setInterval={setInterval} />
      </section>

      {/* Main Tier Cards (Free, Pro, Enterprise) */}
      <section className="px-6 pb-12">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {mainTiers.map((tier) => (
            <TierCard key={tier.id} tier={tier} interval={interval} currentPlan={currentPlan}
              isAuthenticated={isAuthenticated} onSubscribe={handleSubscribe} isLoading={loadingPlan === tier.id} />
          ))}
        </div>
      </section>

      {/* Trust signals */}
      <section className="px-6 pb-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 text-center">
          <div className="flex items-center gap-2 text-sm text-white/50">
            <Check className="w-4 h-4 text-green-400" />
            <span>30-day money-back guarantee</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/50">
            <Check className="w-4 h-4 text-green-400" />
            <span>Cancel anytime, no questions asked</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/50">
            <Check className="w-4 h-4 text-green-400" />
            <span>Save 17% with annual billing</span>
          </div>
        </div>
      </section>

      {/* Advanced Tier Cards (Cyber, Cyber+, Titan) */}
      {advancedTiers.length > 0 && (
        <section className="px-6 pb-16">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">Enterprise, Cyber+, & Titan Tiers</h2>
              <p className="text-white/40 text-sm">Team management, offensive security tools, and dedicated infrastructure for organizations at scale</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
              {advancedTiers.map((tier) => (
                <TierCard key={tier.id} tier={tier} interval={interval} currentPlan={currentPlan}
                  isAuthenticated={isAuthenticated} onSubscribe={handleSubscribe} isLoading={loadingPlan === tier.id} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Comparison Table — auto-populated from shared/pricing.ts */}
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
            <span>&copy; {new Date().getFullYear()} Archibald Titan. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/30">
            <Link href="/terms" className="hover:text-white/60 transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
            <Link href="/contact" className="hover:text-white/60 transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
