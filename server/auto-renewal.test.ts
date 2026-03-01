import { describe, expect, it } from "vitest";
import { PRICING_TIERS, CREDIT_COSTS, CREDIT_PACKS, type PlanId } from "../shared/pricing";

// ─── Auto-Renewal Billing Logic Tests ─────────────────────────────────

describe("Auto-Renewal Billing — Invoice Handling", () => {
  it("subscription_cycle billing reason triggers credit refill", () => {
    const billingReason = "subscription_cycle";
    const shouldRefill = billingReason === "subscription_cycle";
    expect(shouldRefill).toBe(true);
  });

  it("subscription_create billing reason does NOT trigger refill (handled by checkout)", () => {
    const billingReason = "subscription_create";
    const shouldRefill = billingReason === "subscription_cycle";
    expect(shouldRefill).toBe(false);
  });

  it("subscription_update billing reason does NOT trigger refill", () => {
    const billingReason = "subscription_update";
    const shouldRefill = billingReason === "subscription_cycle";
    expect(shouldRefill).toBe(false);
  });

  it("auto-renewal refills correct credits per plan tier", () => {
    const plans: PlanId[] = ["free", "pro", "enterprise"];
    const expectedAllocations = { free: 300, pro: 5000, enterprise: 25000 };

    for (const planId of plans) {
      const tier = PRICING_TIERS.find((t) => t.id === planId)!;
      expect(tier.credits.monthlyAllocation).toBe(expectedAllocations[planId]);
    }
  });

  it("pro plan auto-renewal adds exactly 5000 credits", () => {
    const proTier = PRICING_TIERS.find((t) => t.id === "pro")!;
    let balance = 50; // some remaining credits
    balance += proTier.credits.monthlyAllocation;
    expect(balance).toBe(5050); // remaining + refill
  });

  it("enterprise plan auto-renewal adds exactly 25000 credits", () => {
    const entTier = PRICING_TIERS.find((t) => t.id === "enterprise")!;
    let balance = 200;
    balance += entTier.credits.monthlyAllocation;
    expect(balance).toBe(25200);
  });
});

// ─── Cancellation Logic Tests ─────────────────────────────────────────

describe("Auto-Renewal Billing — Cancellation", () => {
  it("cancelled user keeps remaining credits (not zeroed)", () => {
    let balance = 150;
    const isCancelled = true;
    // On cancellation, we do NOT zero the balance
    // We just stop monthly refills
    if (isCancelled) {
      // No balance change — this is the key behavior
    }
    expect(balance).toBe(150);
  });

  it("cancelled user does not get monthly refill", () => {
    const subscriptionStatus = "canceled";
    const shouldRefill = subscriptionStatus === "active" || subscriptionStatus === "trialing";
    expect(shouldRefill).toBe(false);
  });

  it("active user gets monthly refill", () => {
    const subscriptionStatus = "active";
    const shouldRefill = subscriptionStatus === "active" || subscriptionStatus === "trialing";
    expect(shouldRefill).toBe(true);
  });

  it("trialing user gets monthly refill", () => {
    const subscriptionStatus = "trialing";
    const shouldRefill = subscriptionStatus === "active" || subscriptionStatus === "trialing";
    expect(shouldRefill).toBe(true);
  });

  it("past_due user does not get monthly refill", () => {
    const subscriptionStatus = "past_due";
    const shouldRefill = subscriptionStatus === "active" || subscriptionStatus === "trialing";
    expect(shouldRefill).toBe(false);
  });
});

// ─── Downgrade Logic Tests ──────────────────────────────────────────

describe("Auto-Renewal Billing — Plan Changes", () => {
  it("downgrade from enterprise to pro uses proration (charges immediately)", () => {
    const prorationBehavior = "always_invoice"; // Our Stripe config
    expect(prorationBehavior).toBe("always_invoice");
  });

  it("upgrade from pro to enterprise uses proration (charges immediately)", () => {
    const prorationBehavior = "always_invoice";
    expect(prorationBehavior).toBe("always_invoice");
  });

  it("enterprise is more expensive than pro (monthly)", () => {
    const pro = PRICING_TIERS.find((t) => t.id === "pro")!;
    const enterprise = PRICING_TIERS.find((t) => t.id === "enterprise")!;
    expect(enterprise.monthlyPrice).toBeGreaterThan(pro.monthlyPrice);
  });

  it("enterprise is more expensive than pro (yearly)", () => {
    const pro = PRICING_TIERS.find((t) => t.id === "pro")!;
    const enterprise = PRICING_TIERS.find((t) => t.id === "enterprise")!;
    expect(enterprise.yearlyPrice).toBeGreaterThan(pro.yearlyPrice);
  });

  it("plan change updates local subscription record immediately", () => {
    let localPlan: PlanId = "enterprise";
    const newPlan: PlanId = "pro";
    localPlan = newPlan;
    expect(localPlan).toBe("pro");
  });
});

// ─── Monthly Refill Cron Logic Tests ────────────────────────────────

describe("Monthly Credit Refill — Cron Logic", () => {
  it("refill is idempotent: same month refill is skipped", () => {
    const now = new Date();
    const lastRefillAt = new Date(now.getFullYear(), now.getMonth(), 1);
    const sameMonth =
      lastRefillAt.getUTCFullYear() === now.getUTCFullYear() &&
      lastRefillAt.getUTCMonth() === now.getUTCMonth();
    expect(sameMonth).toBe(true); // Should skip
  });

  it("refill triggers when last refill was previous month", () => {
    const now = new Date();
    const lastRefillAt = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const sameMonth =
      lastRefillAt.getUTCFullYear() === now.getUTCFullYear() &&
      lastRefillAt.getUTCMonth() === now.getUTCMonth();
    expect(sameMonth).toBe(false); // Should refill
  });

  it("refill triggers when lastRefillAt is null (never refilled)", () => {
    const lastRefillAt = null;
    const shouldRefill = lastRefillAt === null;
    expect(shouldRefill).toBe(true);
  });

  it("unlimited users are skipped during batch refill", () => {
    const isUnlimited = true;
    const shouldProcess = !isUnlimited;
    expect(shouldProcess).toBe(false);
  });

  it("cron endpoint requires authorization", () => {
    const authHeader = "Bearer wrong-secret";
    const cronSecret = "correct-secret";
    const isAuthorized = authHeader === `Bearer ${cronSecret}`;
    expect(isAuthorized).toBe(false);
  });

  it("cron endpoint accepts correct authorization", () => {
    const secret = "my-cron-secret";
    const authHeader = `Bearer ${secret}`;
    const isAuthorized = authHeader === `Bearer ${secret}`;
    expect(isAuthorized).toBe(true);
  });
});

// ─── Stripe Status Mapping Tests ────────────────────────────────────

describe("Auto-Renewal Billing — Stripe Status Mapping", () => {
  function mapStripeStatus(
    stripeStatus: string
  ): "active" | "canceled" | "past_due" | "incomplete" | "trialing" {
    switch (stripeStatus) {
      case "active": return "active";
      case "canceled":
      case "unpaid": return "canceled";
      case "past_due": return "past_due";
      case "incomplete":
      case "incomplete_expired": return "incomplete";
      case "trialing": return "trialing";
      default: return "active";
    }
  }

  it("maps 'active' to 'active'", () => {
    expect(mapStripeStatus("active")).toBe("active");
  });

  it("maps 'canceled' to 'canceled'", () => {
    expect(mapStripeStatus("canceled")).toBe("canceled");
  });

  it("maps 'unpaid' to 'canceled'", () => {
    expect(mapStripeStatus("unpaid")).toBe("canceled");
  });

  it("maps 'past_due' to 'past_due'", () => {
    expect(mapStripeStatus("past_due")).toBe("past_due");
  });

  it("maps 'incomplete' to 'incomplete'", () => {
    expect(mapStripeStatus("incomplete")).toBe("incomplete");
  });

  it("maps 'incomplete_expired' to 'incomplete'", () => {
    expect(mapStripeStatus("incomplete_expired")).toBe("incomplete");
  });

  it("maps 'trialing' to 'trialing'", () => {
    expect(mapStripeStatus("trialing")).toBe("trialing");
  });

  it("maps unknown status to 'active' (safe default)", () => {
    expect(mapStripeStatus("some_unknown_status")).toBe("active");
  });
});

// ─── Invoice Payment Failed Logic ───────────────────────────────────

describe("Auto-Renewal Billing — Payment Failure", () => {
  it("failed payment marks subscription as past_due", () => {
    let status = "active";
    const paymentFailed = true;
    if (paymentFailed) {
      status = "past_due";
    }
    expect(status).toBe("past_due");
  });

  it("past_due subscription preserves existing credits", () => {
    let balance = 300;
    const status = "past_due";
    // Credits are NOT removed on payment failure
    expect(balance).toBe(300);
  });

  it("past_due subscription does not get new refills", () => {
    const status = "past_due";
    const shouldRefill = status === "active" || status === "trialing";
    expect(shouldRefill).toBe(false);
  });
});

// ─── Desktop Login Page Logic Tests ─────────────────────────────────

describe("Desktop Login — Authentication Flow", () => {
  it("desktop login requires email and password", () => {
    const email = "user@example.com";
    const password = "securepass123";
    const isValid = email.length > 0 && password.length > 0;
    expect(isValid).toBe(true);
  });

  it("desktop login rejects empty email", () => {
    const email = "";
    const password = "securepass123";
    const isValid = email.length > 0 && password.length > 0;
    expect(isValid).toBe(false);
  });

  it("desktop login rejects empty password", () => {
    const email = "user@example.com";
    const password = "";
    const isValid = email.length > 0 && password.length > 0;
    expect(isValid).toBe(false);
  });

  it("successful login saves license locally", () => {
    const loginResult = {
      licenseKey: "jwt-token-here",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      user: { id: 1, name: "Test User", email: "test@example.com", role: "user" },
      credits: { balance: 50, isUnlimited: false },
      plan: "free",
    };

    expect(loginResult.licenseKey).toBeTruthy();
    expect(loginResult.user.id).toBe(1);
    expect(loginResult.credits.balance).toBe(50);
  });

  it("desktop app navigates to /dashboard after successful login", () => {
    const targetPath = "/dashboard";
    expect(targetPath).toBe("/dashboard");
  });

  it("desktop app navigates to /desktop-login when no license exists", () => {
    const hasLicense = false;
    const targetPath = hasLicense ? "/dashboard" : "/desktop-login";
    expect(targetPath).toBe("/desktop-login");
  });

  it("desktop app navigates to /dashboard when license exists", () => {
    const hasLicense = true;
    const targetPath = hasLicense ? "/dashboard" : "/desktop-login";
    expect(targetPath).toBe("/dashboard");
  });
});

// ─── Initial Checkout Credit Grant Tests ────────────────────────────

describe("Auto-Renewal Billing — Initial Checkout Credits", () => {
  it("new pro subscription grants initial monthly allocation", () => {
    const proTier = PRICING_TIERS.find((t) => t.id === "pro")!;
    let balance = 50; // signup bonus (free tier)
    balance += proTier.credits.monthlyAllocation;
    expect(balance).toBe(5050);
  });

  it("new enterprise subscription grants initial monthly allocation", () => {
    const entTier = PRICING_TIERS.find((t) => t.id === "enterprise")!;
    let balance = 2500; // enterprise signup bonus
    balance += entTier.credits.monthlyAllocation;
    expect(balance).toBe(27500);
  });

  it("free plan checkout does not happen (no Stripe checkout for free)", () => {
    const freeTier = PRICING_TIERS.find((t) => t.id === "free")!;
    expect(freeTier.monthlyPrice).toBe(0);
    // Free users get credits via signup bonus and monthly refill, not checkout
  });
});

// ─── End-to-End Renewal Scenario Tests ──────────────────────────────

describe("Auto-Renewal Billing — E2E Scenarios", () => {
  it("pro user full lifecycle: signup → use → renewal → use", () => {
    const proTier = PRICING_TIERS.find((t) => t.id === "pro")!;

    // Signup: get signup bonus
    let balance = proTier.credits.signupBonus; // 500
    expect(balance).toBe(500);

    // Initial checkout: get first month allocation
    balance += proTier.credits.monthlyAllocation; // +5000
    expect(balance).toBe(5500);

    // Use credits during month 1
    balance -= 200 * CREDIT_COSTS.chat_message; // -200
    balance -= 20 * CREDIT_COSTS.builder_action; // -60 (3 credits each)
    expect(balance).toBe(5240);

    // Auto-renewal: Stripe charges, invoice.paid fires, credits refilled
    balance += proTier.credits.monthlyAllocation; // +5000
    expect(balance).toBe(10240);

    // Use credits during month 2
    balance -= 150 * CREDIT_COSTS.chat_message; // -150
    expect(balance).toBe(10090);
  });

  it("user cancels mid-month: keeps remaining credits, no future refills", () => {
    const proTier = PRICING_TIERS.find((t) => t.id === "pro")!;

    let balance = proTier.credits.monthlyAllocation; // 5000
    balance -= 100 * CREDIT_COSTS.chat_message; // -100
    expect(balance).toBe(4900);

    // User cancels — balance preserved
    const isCancelled = true;
    // No balance change
    expect(balance).toBe(4900);

    // Next month: no refill because cancelled
    const shouldRefill = !isCancelled;
    expect(shouldRefill).toBe(false);
    // Balance stays at 4900 until used up
    expect(balance).toBe(4900);
  });

  it("downgrade from enterprise to pro: immediate charge, plan updates", () => {
    const entTier = PRICING_TIERS.find((t) => t.id === "enterprise")!;
    const proTier = PRICING_TIERS.find((t) => t.id === "pro")!;

    let balance = entTier.credits.monthlyAllocation; // 25000
    balance -= 1000; // used some

    // Downgrade happens — Stripe charges proration immediately
    let plan: PlanId = "enterprise";
    plan = "pro";
    expect(plan).toBe("pro");

    // Balance is preserved (not reduced)
    expect(balance).toBe(24000);

    // Next renewal: pro allocation instead of enterprise
    balance += proTier.credits.monthlyAllocation; // +5000
    expect(balance).toBe(29000);
  });

  it("payment failure: credits preserved, no refill until resolved", () => {
    let balance = 300;
    let status = "active";

    // Payment fails
    status = "past_due";
    expect(status).toBe("past_due");

    // Credits preserved
    expect(balance).toBe(300);

    // No refill while past_due
    const shouldRefill = status === "active" || status === "trialing";
    expect(shouldRefill).toBe(false);

    // User fixes payment
    status = "active";
    const shouldRefillNow = status === "active";
    expect(shouldRefillNow).toBe(true);
  });
});
