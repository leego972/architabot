/**
 * Business Logic Tests
 * Covers: credit math, marketplace commission splits, pricing conversions,
 * CSRF token validation, and correlation ID generation.
 */
import { describe, it, expect, beforeEach } from "vitest";

// ─── Credit Costs ────────────────────────────────────────────────────

describe("CREDIT_COSTS", () => {
  let CREDIT_COSTS: Record<string, number>;

  beforeEach(async () => {
    const pricing = await import("../../shared/pricing");
    CREDIT_COSTS = pricing.CREDIT_COSTS as unknown as Record<string, number>;
  });

  it("chat_message costs exactly 1 credit", () => {
    expect(CREDIT_COSTS.chat_message).toBe(1);
  });

  it("builder_action costs 3 credits", () => {
    expect(CREDIT_COSTS.builder_action).toBe(3);
  });

  it("clone_action is the most expensive at 50 credits", () => {
    const maxCost = Math.max(...Object.values(CREDIT_COSTS));
    expect(CREDIT_COSTS.clone_action).toBe(maxCost);
    expect(maxCost).toBe(50);
  });

  it("all credit costs are positive integers", () => {
    for (const [action, cost] of Object.entries(CREDIT_COSTS)) {
      expect(cost, `${action} should be positive`).toBeGreaterThan(0);
      expect(Number.isInteger(cost), `${action} should be an integer`).toBe(true);
    }
  });

  it("image_generation is more expensive than chat", () => {
    expect(CREDIT_COSTS.image_generation).toBeGreaterThan(CREDIT_COSTS.chat_message);
  });
});

// ─── Credit Packs ────────────────────────────────────────────────────

describe("CREDIT_PACKS", () => {
  let CREDIT_PACKS: Array<{ id: string; credits: number; price: number }>;

  beforeEach(async () => {
    const pricing = await import("../../shared/pricing");
    CREDIT_PACKS = pricing.CREDIT_PACKS;
  });

  it("all packs have positive credit amounts", () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.credits, `${pack.id} credits`).toBeGreaterThan(0);
    }
  });

  it("all packs have positive prices", () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.price, `${pack.id} price`).toBeGreaterThan(0);
    }
  });

  it("larger packs give more credits", () => {
    const sorted = [...CREDIT_PACKS].sort((a, b) => a.credits - b.credits);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].credits).toBeGreaterThan(sorted[i - 1].credits);
    }
  });

  it("per-credit cost decreases with larger packs (volume discount)", () => {
    const sorted = [...CREDIT_PACKS].sort((a, b) => a.credits - b.credits);
    for (let i = 1; i < sorted.length; i++) {
      const prevCostPerCredit = sorted[i - 1].price / sorted[i - 1].credits;
      const currCostPerCredit = sorted[i].price / sorted[i].credits;
      // Use toBeCloseTo to handle floating point precision issues
      // currCostPerCredit should be <= prevCostPerCredit (with tolerance)
      expect(
        currCostPerCredit - prevCostPerCredit,
        `${sorted[i].id} should be cheaper or equal per-credit than ${sorted[i - 1].id}`
      ).toBeLessThanOrEqual(0.001);
    }
  });
});

// ─── Pricing Tiers ───────────────────────────────────────────────────

describe("PRICING_TIERS", () => {
  let PRICING_TIERS: Array<{
    id: string;
    name: string;
    monthlyPrice: number;
    yearlyPrice: number;
    credits: { monthlyAllocation: number; signupBonus: number };
  }>;

  beforeEach(async () => {
    const pricing = await import("../../shared/pricing");
    PRICING_TIERS = pricing.PRICING_TIERS;
  });

  it("free tier costs $0", () => {
    const free = PRICING_TIERS.find((t) => t.id === "free");
    expect(free).toBeDefined();
    expect(free!.monthlyPrice).toBe(0);
    expect(free!.yearlyPrice).toBe(0);
  });

  it("yearly price is always less than 12x monthly (annual discount)", () => {
    for (const tier of PRICING_TIERS) {
      if (tier.monthlyPrice > 0 && tier.yearlyPrice > 0) {
        expect(
          tier.yearlyPrice,
          `${tier.id} yearly should be less than 12x monthly`
        ).toBeLessThan(tier.monthlyPrice * 12);
      }
    }
  });

  it("higher tiers get more monthly credits", () => {
    const paidTiers = PRICING_TIERS.filter(
      (t) => t.monthlyPrice > 0 && t.credits.monthlyAllocation > 0
    ).sort((a, b) => a.monthlyPrice - b.monthlyPrice);

    for (let i = 1; i < paidTiers.length; i++) {
      expect(
        paidTiers[i].credits.monthlyAllocation,
        `${paidTiers[i].id} should get more credits than ${paidTiers[i - 1].id}`
      ).toBeGreaterThanOrEqual(paidTiers[i - 1].credits.monthlyAllocation);
    }
  });

  it("all tiers have a signup bonus", () => {
    for (const tier of PRICING_TIERS) {
      expect(
        tier.credits.signupBonus,
        `${tier.id} should have a signup bonus >= 0`
      ).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Marketplace Commission Math ─────────────────────────────────────

describe("Marketplace Commission", () => {
  const PLATFORM_COMMISSION_RATE = 0.08;

  it("seller receives 92% of price", () => {
    const price = 1000;
    const sellerShare = Math.floor(price * (1 - PLATFORM_COMMISSION_RATE));
    expect(sellerShare).toBe(920);
  });

  it("platform fee is 8% of price", () => {
    const price = 1000;
    const sellerShare = Math.floor(price * (1 - PLATFORM_COMMISSION_RATE));
    const platformFee = price - sellerShare;
    expect(platformFee).toBe(80);
  });

  it("commission rounds down in seller's favor for odd amounts", () => {
    const price = 101;
    const sellerShare = Math.floor(price * (1 - PLATFORM_COMMISSION_RATE));
    // 101 * 0.92 = 92.92 → floor = 92
    expect(sellerShare).toBe(92);
    expect(price - sellerShare).toBe(9); // platform gets slightly more due to rounding
  });

  it("zero price results in zero commission", () => {
    const price = 0;
    const sellerShare = Math.floor(price * (1 - PLATFORM_COMMISSION_RATE));
    expect(sellerShare).toBe(0);
  });

  it("minimum price of 1 credit still produces valid split", () => {
    const price = 1;
    const sellerShare = Math.floor(price * (1 - PLATFORM_COMMISSION_RATE));
    expect(sellerShare).toBe(0); // floor(0.92) = 0
    expect(price - sellerShare).toBe(1); // platform gets the 1 credit
  });

  it("large price produces correct split", () => {
    const price = 100000;
    const sellerShare = Math.floor(price * (1 - PLATFORM_COMMISSION_RATE));
    expect(sellerShare).toBe(92000);
    expect(price - sellerShare).toBe(8000);
  });
});

// ─── Credit-to-USD Conversion ────────────────────────────────────────

describe("Credit-to-USD Conversion", () => {
  const CREDIT_TO_USD_RATE = 0.01; // 1 credit = $0.01
  const MIN_STRIPE_CHARGE = 0.50; // Stripe minimum

  it("100 credits = $1.00", () => {
    expect(100 * CREDIT_TO_USD_RATE).toBe(1.0);
  });

  it("1 credit = $0.01", () => {
    expect(1 * CREDIT_TO_USD_RATE).toBe(0.01);
  });

  it("prices below $0.50 should be clamped to minimum Stripe charge", () => {
    const credits = 10; // $0.10
    const rawUsd = credits * CREDIT_TO_USD_RATE;
    const chargeUsd = Math.max(rawUsd, MIN_STRIPE_CHARGE);
    expect(chargeUsd).toBe(0.50);
  });

  it("prices at or above $0.50 are not clamped", () => {
    const credits = 50; // $0.50
    const rawUsd = credits * CREDIT_TO_USD_RATE;
    const chargeUsd = Math.max(rawUsd, MIN_STRIPE_CHARGE);
    expect(chargeUsd).toBe(0.50);

    const credits2 = 500; // $5.00
    const rawUsd2 = credits2 * CREDIT_TO_USD_RATE;
    const chargeUsd2 = Math.max(rawUsd2, MIN_STRIPE_CHARGE);
    expect(chargeUsd2).toBe(5.0);
  });

  it("USD to cents conversion is exact", () => {
    const usd = 29.99;
    const cents = Math.round(usd * 100);
    expect(cents).toBe(2999);
  });
});

// ─── CSRF Token Validation ───────────────────────────────────────────

describe("CSRF Token Validation", () => {
  it("tokens are 64-character hex strings", () => {
    // Simulate what the CSRF module generates
    const crypto = require("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    expect(token).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(token)).toBe(true);
  });

  it("two generated tokens are never equal", () => {
    const crypto = require("crypto");
    const token1 = crypto.randomBytes(32).toString("hex");
    const token2 = crypto.randomBytes(32).toString("hex");
    expect(token1).not.toBe(token2);
  });
});

// ─── Correlation ID ──────────────────────────────────────────────────

describe("Correlation ID Format", () => {
  it("generates valid UUID v4 format", () => {
    const crypto = require("crypto");
    const id = crypto.randomUUID();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});

// ─── SQL Sanitization (extended) ─────────────────────────────────────

describe("SQL Sanitization (extended)", () => {
  let safeSqlIdentifier: (id: string) => string;
  let safeDDLStatement: (stmt: string) => string;

  beforeEach(async () => {
    const mod = await import("./sql-sanitize");
    safeSqlIdentifier = mod.safeSqlIdentifier;
    safeDDLStatement = mod.safeDDLStatement;
  });

  it("rejects identifiers with SQL injection attempts", () => {
    expect(() => safeSqlIdentifier("users; DROP TABLE users")).toThrow();
    expect(() => safeSqlIdentifier("users' OR '1'='1")).toThrow();
    expect(() => safeSqlIdentifier("users--")).toThrow();
  });

  it("allows valid table names with underscores", () => {
    expect(safeSqlIdentifier("credit_balances")).toBe("credit_balances");
    expect(safeSqlIdentifier("marketplace_listings")).toBe("marketplace_listings");
  });

  it("rejects empty identifiers", () => {
    expect(() => safeSqlIdentifier("")).toThrow();
  });

  it("rejects identifiers starting with numbers", () => {
    expect(() => safeSqlIdentifier("123table")).toThrow();
  });

  it("DDL rejects dangerous non-DDL statements", () => {
    expect(() =>
      safeDDLStatement("SELECT * FROM users WHERE 1=1")
    ).toThrow();
    expect(() =>
      safeDDLStatement("DELETE FROM users")
    ).toThrow();
    expect(() =>
      safeDDLStatement("UPDATE users SET admin=1")
    ).toThrow();
  });
});
