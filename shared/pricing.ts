/**
 * Centralized pricing configuration for Archibald Titan.
 * Products and prices are defined here for consistency across frontend and backend.
 *
 * CREDIT PHILOSOPHY:
 * - Paying users should get generous, fair value for their money.
 * - A Pro user ($29/mo) should be able to use the platform daily without worrying about credits.
 * - An Enterprise user ($99/mo) should never hit a limit in normal usage.
 * - Credit costs are kept low so users feel empowered, not restricted.
 * - Top-up packs exist for users who run out mid-month but don't want to upgrade yet.
 * - Top-up packs are intentionally more expensive per-credit than upgrading — this makes
 *   upgrading the obvious better deal and drives conversions.
 *
 * TIER STRUCTURE:
 * Free → Pro → Enterprise → Cyber → Cyber+ → Titan
 *
 * UPGRADE INCENTIVE MATH:
 * - Top-up 5,000 credits = $29.99 (same price as Pro monthly!)
 * - Pro gives 5,000 credits/mo for $29/mo — clearly better value than buying a top-up
 * - Top-up 10,000 credits = $49.99 — Enterprise gives 25,000 for $99/mo (2.5x more for 2x price)
 * - This pricing structure naturally pushes heavy users toward upgrading.
 */

export type PlanId = "free" | "pro" | "enterprise" | "cyber" | "cyber_plus" | "titan";

export interface PricingTier {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyPrice: number; // in USD, 0 = free
  yearlyPrice: number;  // in USD, 0 = free
  features: string[];
  highlighted: boolean;
  cta: string;
  limits: {
    fetchesPerMonth: number;    // -1 = unlimited
    providers: number;          // -1 = all
    credentialStorage: number;  // -1 = unlimited
    proxySlots: number;         // 0 = none
    exportFormats: string[];
    support: string;
  };
  credits: {
    monthlyAllocation: number;  // credits added each month, -1 = unlimited
    signupBonus: number;        // one-time bonus on first signup
  };
}

export const PRICING_TIERS: PricingTier[] = [
  // ─── FREE ────────────────────────────────────────────────────────
  {
    id: "free",
    name: "Free",
    tagline: "Get started with the basics",
    monthlyPrice: 0,
    yearlyPrice: 0,
    highlighted: false,
    cta: "Get Started Free",
    features: [
      "5 fetches per month",
      "3 providers (AWS, Azure, GCP)",
      "AES-256 encrypted vault",
      "JSON export",
      "Community support",
      "Basic stealth browser",
      "300 credits/month",
    ],
    limits: {
      fetchesPerMonth: 5,
      providers: 3,
      credentialStorage: 25,
      proxySlots: 0,
      exportFormats: ["json"],
      support: "community",
    },
    credits: {
      monthlyAllocation: 300,
      signupBonus: 100,
    },
  },

  // ─── PRO ─────────────────────────────────────────────────────────
  {
    id: "pro",
    name: "Pro",
    tagline: "For power users and professionals",
    monthlyPrice: 29,
    yearlyPrice: 290,
    highlighted: true,
    cta: "Upgrade to Pro",
    features: [
      "Unlimited fetches",
      "All 15+ providers",
      "AES-256 encrypted vault",
      "JSON & .ENV export",
      "Priority email support",
      "Advanced stealth browser",
      "CAPTCHA auto-solving",
      "5 proxy slots",
      "Kill switch",
      "Scheduled fetches",
      "Developer API (100 req/day)",
      "API key management",
      "5,000 credits/month (~165 builder tasks)",
    ],
    limits: {
      fetchesPerMonth: -1,
      providers: -1,
      credentialStorage: -1,
      proxySlots: 5,
      exportFormats: ["json", "env"],
      support: "priority_email",
    },
    credits: {
      monthlyAllocation: 5000,
      signupBonus: 500,
    },
  },

  // ─── ENTERPRISE ──────────────────────────────────────────────────
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For organizations at scale",
    monthlyPrice: 99,
    yearlyPrice: 990,
    highlighted: false,
    cta: "Contact Sales",
    features: [
      "Everything in Pro",
      "Unlimited proxy slots",
      "Team management (up to 25 seats)",
      "Developer API (10,000 req/day)",
      "Webhook integrations",
      "Custom provider integrations",
      "Dedicated account manager",
      "SLA guarantee (99.9% uptime)",
      "SSO / SAML authentication",
      "Audit logs",
      "White-label option",
      "25,000 credits/month (~830 builder tasks)",
    ],
    limits: {
      fetchesPerMonth: -1,
      providers: -1,
      credentialStorage: -1,
      proxySlots: -1,
      exportFormats: ["json", "env", "csv", "api"],
      support: "dedicated",
    },
    credits: {
      monthlyAllocation: 25000,
      signupBonus: 2500,
    },
  },

  // ─── CYBER ───────────────────────────────────────────────────────
  {
    id: "cyber",
    name: "Cyber",
    tagline: "Elite cybersecurity arsenal for professionals",
    monthlyPrice: 199,
    yearlyPrice: 1990,
    highlighted: false,
    cta: "Unlock Cyber",
    features: [
      "Everything in Enterprise",
      "Credential Leak Scanner",
      "Credential Health Monitor",
      "TOTP Vault (2FA management)",
      "Advanced threat modeling",
      "Vulnerability auto-fixer",
      "Security code review",
      "Red team automation",
      "Priority security support",
      "75,000 credits/month",
    ],
    limits: {
      fetchesPerMonth: -1,
      providers: -1,
      credentialStorage: -1,
      proxySlots: -1,
      exportFormats: ["json", "env", "csv", "api"],
      support: "priority_security",
    },
    credits: {
      monthlyAllocation: 75000,
      signupBonus: 5000,
    },
  },

  // ─── CYBER+ ──────────────────────────────────────────────────────
  {
    id: "cyber_plus",
    name: "Cyber+",
    tagline: "Maximum firepower for security teams and agencies",
    monthlyPrice: 499,
    yearlyPrice: 4990,
    highlighted: false,
    cta: "Go Cyber+",
    features: [
      "Everything in Cyber",
      "300,000 credits/month",
      "Website Clone Engine (exclusive)",
      "Unlimited team seats",
      "Zero-click exploit research",
      "C2 framework building",
      "Offensive security tooling",
      "Custom AI model fine-tuning",
      "Dedicated infrastructure",
      "Developer API (unlimited req/day)",
      "Multi-org management",
      "Volume discount on credit top-ups",
      "Direct Slack/Teams support channel",
    ],
    limits: {
      fetchesPerMonth: -1,
      providers: -1,
      credentialStorage: -1,
      proxySlots: -1,
      exportFormats: ["json", "env", "csv", "api"],
      support: "dedicated_slack",
    },
    credits: {
      monthlyAllocation: 300000,
      signupBonus: 25000,
    },
  },

  // ─── TITAN ───────────────────────────────────────────────────────
  {
    id: "titan",
    name: "Titan",
    tagline: "Unlimited power for large-scale enterprise operations",
    monthlyPrice: 4999,
    yearlyPrice: 49990,
    highlighted: false,
    cta: "Contact Sales",
    features: [
      "Everything in Cyber+",
      "1,000,000 credits/month",
      "Website Clone Engine (exclusive)",
      "Dedicated GPU cluster",
      "Custom model training on your data",
      "On-premise deployment option",
      "24/7 phone support",
      "Quarterly business reviews",
      "Custom SLA (99.99% uptime)",
      "Compliance certifications (SOC2, ISO 27001)",
      "Data residency options",
      "Priority feature development",
      "White-glove onboarding",
      "Early access to all new features",
    ],
    limits: {
      fetchesPerMonth: -1,
      providers: -1,
      credentialStorage: -1,
      proxySlots: -1,
      exportFormats: ["json", "env", "csv", "api"],
      support: "white_glove",
    },
    credits: {
      monthlyAllocation: 1000000,
      signupBonus: 100000,
    },
  },
];

/**
 * Stripe Price IDs — these will be created in Stripe and mapped here.
 * For test mode, we create prices dynamically via the API.
 * For production, replace these with actual Stripe Price IDs.
 */
// ─── Credit Costs ──────────────────────────────────────────────────
//
// COST PHILOSOPHY:
// - Chat messages should feel free — users should never hesitate to ask a question.
// - Builder actions cost more because they consume LLM tokens and modify code.
// - Fetches and voice are moderate — they use external APIs.
// - A typical builder request (7-12 tool calls) should cost ~20-35 credits total.
// - A Pro user with 5000 credits should get ~150-250 builder requests per month.
//   That's 5-8 builder requests per day — solid daily usage.

export const CREDIT_COSTS = {
  chat_message: 1,        // 1 credit per chat message — feels free
  builder_action: 3,      // 3 credits per builder tool action
  voice_action: 2,        // 2 credits per voice transcription
  fetch_action: 1,        // 1 credit per credential fetch — fetches should feel cheap
  clone_action: 50,       // 50 credits per website clone — premium feature (Cyber+/Titan only)
  github_action: 5,       // 5 credits per GitHub repo create or push
  image_generation: 10,   // 10 credits per AI image generation (DALL-E is expensive)
} as const;

export type CreditActionType = keyof typeof CREDIT_COSTS;

// ─── Credit Top-Up Packs (one-time purchases) ──────────────────────
//
// TOP-UP PHILOSOPHY:
// - Top-ups exist for users who run out mid-month but don't want to upgrade yet.
// - INTENTIONALLY more expensive per-credit than upgrading to a higher plan.
// - This creates a natural "upgrade nudge" — after buying 2 top-ups, the user realizes
//   upgrading would have been cheaper. This drives plan upgrades.
// - Small packs (5,000) are priced at the same cost as Pro monthly ($29.99) to make
//   the comparison obvious: "Why buy 5K credits once when Pro gives 5K every month?"
// - Large packs (10,000) are priced at half of Enterprise monthly ($49.99) but give
//   less than half the credits — again making Enterprise the better deal.

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price: number; // USD
  popular?: boolean;
  upgradeNudge?: string; // shown to user to encourage plan upgrade instead
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: "pack_500",
    name: "Quick Top-Up",
    credits: 500,
    price: 4.99,
    upgradeNudge: undefined, // too small to nudge
  },
  {
    id: "pack_2500",
    name: "Boost Pack",
    credits: 2500,
    price: 14.99,
    popular: true,
    upgradeNudge: "Pro gives 5,000 credits/mo for just $29 — 2x the credits!",
  },
  {
    id: "pack_5000",
    name: "Power Top-Up",
    credits: 5000,
    price: 29.99,
    upgradeNudge: "Pro gives the same 5,000 credits every month for $29/mo — upgrade and save!",
  },
  {
    id: "pack_10000",
    name: "Mega Top-Up",
    credits: 10000,
    price: 49.99,
    upgradeNudge: "Enterprise gives 25,000 credits/mo for $99 — 2.5x more credits for 2x the price!",
  },
];

// ─── Clone Website Pricing (per-use, billed via Stripe) ────────────
//
// CLONE PRICING PHILOSOPHY:
// - A fully cloned, branded website with payment integration is worth $3,500–$8,000+
//   from a freelancer and takes 2–4 weeks. We deliver it in minutes.
// - Pricing is tiered by complexity, auto-detected from the target site.
// - Even at $3,500 for enterprise, it's still HALF what an agency charges.
// - Minimum $500 ensures the feature is treated as a premium product, not a toy.
// - Only available to Cyber+ and Titan subscribers.
// - Titan users get a discount as part of their premium tier.

export type CloneComplexity = "simple" | "standard" | "advanced" | "enterprise";

export interface ClonePricingTier {
  id: CloneComplexity;
  name: string;
  description: string;
  price: number;           // USD — base price
  titanPrice: number;      // USD — discounted price for Titan subscribers
  maxPages: number;        // page count threshold for auto-detection
  features: string[];      // what's included at this tier
}

export const CLONE_PRICING: ClonePricingTier[] = [
  {
    id: "simple",
    name: "Simple Clone",
    description: "Landing pages, portfolios, brochure sites",
    price: 500,
    titanPrice: 350,
    maxPages: 5,
    features: [
      "Up to 5 pages",
      "Responsive design",
      "Your branding & colors",
      "Contact form",
      "SEO meta tags",
      "GitHub repo + deploy ready",
    ],
  },
  {
    id: "standard",
    name: "Standard Clone",
    description: "Business websites, blogs, multi-page sites",
    price: 1000,
    titanPrice: 700,
    maxPages: 15,
    features: [
      "Up to 15 pages",
      "Everything in Simple",
      "Blog / news section",
      "Dynamic content areas",
      "Multiple forms",
      "Image gallery",
      "Newsletter signup",
    ],
  },
  {
    id: "advanced",
    name: "Advanced Clone",
    description: "E-commerce, SaaS, marketplace sites",
    price: 2000,
    titanPrice: 1400,
    maxPages: 50,
    features: [
      "Up to 50 pages",
      "Everything in Standard",
      "Stripe payment integration",
      "Product catalog",
      "Shopping cart & checkout",
      "User authentication",
      "Dashboard / admin panel",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise Clone",
    description: "Complex web applications, multi-feature platforms",
    price: 3500,
    titanPrice: 2500,
    maxPages: -1, // unlimited
    features: [
      "Unlimited pages",
      "Everything in Advanced",
      "Custom API integrations",
      "Multi-role user system",
      "Advanced admin panels",
      "Real-time features",
      "Priority build queue",
    ],
  },
];

// Helper to determine clone complexity from page count and feature analysis
export function detectCloneComplexity(pageCount: number, hasPayments: boolean, hasAuth: boolean): CloneComplexity {
  if (hasPayments || hasAuth || pageCount > 50) return "enterprise";
  if (pageCount > 15) return "advanced";
  if (pageCount > 5) return "standard";
  return "simple";
}

// Get the price for a clone based on complexity and user tier
export function getClonePrice(complexity: CloneComplexity, planId: PlanId): number {
  const tier = CLONE_PRICING.find(t => t.id === complexity);
  if (!tier) return 500; // fallback to minimum
  return planId === "titan" ? tier.titanPrice : tier.price;
}

export const STRIPE_PRICES: Record<string, { monthly: string; yearly: string }> = {
  pro: {
    monthly: "", // Will be set dynamically or via env
    yearly: "",
  },
  enterprise: {
    monthly: "",
    yearly: "",
  },
  cyber: {
    monthly: "",
    yearly: "",
  },
  cyber_plus: {
    monthly: "",
    yearly: "",
  },
  titan: {
    monthly: "",
    yearly: "",
  },
};
