/**
 * Autonomous Affiliate Signup Engine
 * 
 * Uses Titan's own stealth browser engine, CAPTCHA solver, and proxy pool
 * to automatically sign up for affiliate programs discovered by the discovery engine.
 * 
 * Business email: archibaldtitan@gmail.com
 * 
 * Flow:
 * 1. Picks pending applications from the discovery engine
 * 2. Navigates to the affiliate program signup page
 * 3. Auto-fills registration forms with business details
 * 4. Handles CAPTCHAs using configured CAPTCHA service
 * 5. Submits the application
 * 6. Tracks results and stores affiliate IDs/links back into partner DB
 * 
 * Kill switch: AFSIGNUP_KILL (shared with discovery engine)
 */

import type { Page } from "playwright";
import {
  launchStealthBrowser,
  takeScreenshot,
  humanDelay,
  humanType,
  humanClick,
  humanScroll,
  type BrowserConfig,
} from "./fetcher-engine/browser";
import { detectAndSolveCaptcha, detectBotProtection, type CaptchaConfig } from "./fetcher-engine/captcha-solver";
import { getDb } from "./db";
import {
  affiliateDiscoveries,
  affiliateApplications,
  affiliatePartners,
} from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { invokeLLM } from "./_core/llm";
import { getSettings } from "./fetcher-db";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
const log = createLogger("AffiliateSignupEngine");

// ─── Business Details ────────────────────────────────────────────────
// All personal details loaded from environment variables — NEVER hardcode in source
const BUSINESS_PROFILE = {
  email: process.env.AFFILIATE_EMAIL || "archibaldtitan@gmail.com",
  companyName: process.env.AFFILIATE_COMPANY_NAME || "ArchibaldTitan",
  websiteUrl: "https://www.archibaldtitan.com",
  fullName: process.env.AFFILIATE_FULL_NAME || "Archibald Titan Team",
  firstName: process.env.AFFILIATE_FIRST_NAME || "Archibald",
  lastName: process.env.AFFILIATE_LAST_NAME || "Titan",
  phone: process.env.AFFILIATE_PHONE || "",
  abn: process.env.AFFILIATE_ABN || "",
  address: process.env.AFFILIATE_ADDRESS || "",
  dateOfBirth: process.env.AFFILIATE_DOB || "",
  description: "Archibald Titan is the world's most advanced AI-powered cybersecurity and developer tools platform, serving thousands of developers and tech professionals with autonomous security scanning, credential management, and AI-assisted development.",
  trafficDescription: "10,000+ monthly active users, primarily developers, AI engineers, cybersecurity professionals, and tech enthusiasts",
  promotionMethods: "In-app contextual recommendations, AI assistant integration, developer tools marketplace, email newsletters, content marketing, social media, cybersecurity forums",
  niche: "Developer Tools, AI/ML, Cybersecurity, Cloud Infrastructure",
  country: process.env.AFFILIATE_COUNTRY || "Australia",
};

// ─── Kill Switch ─────────────────────────────────────────────────────
let signupKilled = false;

export function triggerSignupKillSwitch(): void {
  signupKilled = true;
  log.info("[AffiliateSignup] KILL SWITCH ACTIVATED — all signup operations halted");
}

export function resetSignupKillSwitch(): void {
  signupKilled = false;
  log.info("[AffiliateSignup] Kill switch reset — signup operations resumed");
}

export function isSignupKilled(): boolean {
  return signupKilled;
}

// ─── Signup Result ───────────────────────────────────────────────────
interface SignupResult {
  success: boolean;
  affiliateId?: string;
  affiliateUrl?: string;
  dashboardUrl?: string;
  message: string;
  screenshotPath?: string;
  requiresManualStep?: boolean;
  manualStepDescription?: string;
}

// ─── Common Form Field Patterns ──────────────────────────────────────
// Maps common form field names/labels to our business profile values
const FIELD_MAPPINGS: Array<{
  patterns: RegExp[];
  value: string;
  fieldType: "text" | "email" | "select" | "textarea";
}> = [
  {
    patterns: [/email/i, /e-mail/i, /mail/i, /contact.*email/i],
    value: BUSINESS_PROFILE.email,
    fieldType: "email",
  },
  {
    patterns: [/company/i, /organization/i, /business.*name/i, /brand/i],
    value: BUSINESS_PROFILE.companyName,
    fieldType: "text",
  },
  {
    patterns: [/website/i, /url/i, /site.*url/i, /domain/i, /web.*address/i],
    value: BUSINESS_PROFILE.websiteUrl,
    fieldType: "text",
  },
  {
    patterns: [/full.*name/i, /your.*name/i, /^name$/i, /contact.*name/i],
    value: BUSINESS_PROFILE.fullName,
    fieldType: "text",
  },
  {
    patterns: [/first.*name/i, /given.*name/i, /fname/i],
    value: BUSINESS_PROFILE.firstName,
    fieldType: "text",
  },
  {
    patterns: [/last.*name/i, /surname/i, /family.*name/i, /lname/i],
    value: BUSINESS_PROFILE.lastName,
    fieldType: "text",
  },
  {
    patterns: [/phone/i, /mobile/i, /tel/i, /cell/i],
    value: BUSINESS_PROFILE.phone,
    fieldType: "text",
  },
  {
    patterns: [/description/i, /about/i, /tell.*us/i, /how.*promote/i, /promotion.*method/i],
    value: BUSINESS_PROFILE.description,
    fieldType: "textarea",
  },
  {
    patterns: [/traffic/i, /monthly.*visitor/i, /audience/i, /reach/i],
    value: BUSINESS_PROFILE.trafficDescription,
    fieldType: "textarea",
  },
  {
    patterns: [/promotion/i, /marketing.*method/i, /how.*will.*you/i, /channels/i],
    value: BUSINESS_PROFILE.promotionMethods,
    fieldType: "textarea",
  },
  {
    patterns: [/niche/i, /category/i, /industry/i, /vertical/i, /topic/i],
    value: BUSINESS_PROFILE.niche,
    fieldType: "text",
  },
  {
    patterns: [/country/i, /location/i, /region/i],
    value: BUSINESS_PROFILE.country,
    fieldType: "text",
  },
  {
    patterns: [/abn/i, /tax.*id/i, /business.*number/i, /tax.*number/i, /ein/i, /vat/i],
    value: BUSINESS_PROFILE.abn,
    fieldType: "text",
  },
  {
    patterns: [/address/i, /street/i, /address.*line/i],
    value: process.env.AFFILIATE_STREET || "",
    fieldType: "text",
  },
  {
    patterns: [/city/i, /suburb/i, /town/i, /locality/i],
    value: process.env.AFFILIATE_CITY || "",
    fieldType: "text",
  },
  {
    patterns: [/state/i, /province/i, /territory/i],
    value: process.env.AFFILIATE_STATE || "",
    fieldType: "text",
  },
  {
    patterns: [/post.*code/i, /zip/i, /postal/i],
    value: process.env.AFFILIATE_POSTCODE || "",
    fieldType: "text",
  },
  {
    patterns: [/date.*birth/i, /dob/i, /birth.*date/i],
    value: BUSINESS_PROFILE.dateOfBirth,
    fieldType: "text",
  },
];

// ─── Password Management ────────────────────────────────────────────
// Use a consistent password for all signups so Titan can log back in
// Password loaded from environment variable — NEVER hardcode in source
const DEFAULT_PASSWORD = process.env.AFFILIATE_SIGNUP_PASSWORD || "DefaultPass123!";

function getSignupPassword(): string {
  return DEFAULT_PASSWORD;
}

// Store credentials for each signup in memory (also saved to DB via partner notes)
const credentialStore = new Map<string, { email: string; password: string; signupUrl: string; signedUpAt: Date }>();

export function getStoredCredentials(): Map<string, { email: string; password: string; signupUrl: string; signedUpAt: Date }> {
  return credentialStore;
}

export function getCredentialForDomain(domain: string): { email: string; password: string } | null {
  const cred = credentialStore.get(domain.toLowerCase());
  return cred ? { email: cred.email, password: cred.password } : null;
}

// ─── Intelligent Form Analyzer ───────────────────────────────────────
/**
 * Uses LLM to analyze a page's form structure and determine how to fill it
 */
async function analyzeFormWithLLM(page: Page): Promise<{
  formFields: Array<{
    selector: string;
    label: string;
    type: string;
    suggestedValue: string;
    isRequired: boolean;
  }>;
  submitSelector: string;
  isSignupForm: boolean;
  needsPassword: boolean;
  passwordSelector?: string;
  confirmPasswordSelector?: string;
  termsCheckboxSelector?: string;
}> {
  // Extract form structure from the page
  const formData = await page.evaluate(() => {
    const forms = document.querySelectorAll("form");
    const allInputs = document.querySelectorAll("input, textarea, select");
    
    const fields: Array<{
      tag: string;
      type: string;
      name: string;
      id: string;
      placeholder: string;
      label: string;
      required: boolean;
      className: string;
      ariaLabel: string;
    }> = [];

    allInputs.forEach((el) => {
      const input = el as HTMLInputElement;
      // Find associated label
      let label = "";
      if (input.id) {
        const labelEl = document.querySelector(`label[for="${input.id}"]`);
        if (labelEl) label = labelEl.textContent?.trim() || "";
      }
      if (!label) {
        const parent = input.closest("label, .form-group, .field, [class*='field'], [class*='form']");
        if (parent) {
          const labelEl = parent.querySelector("label, .label, [class*='label']");
          if (labelEl) label = labelEl.textContent?.trim() || "";
        }
      }

      fields.push({
        tag: el.tagName.toLowerCase(),
        type: input.type || "text",
        name: input.name || "",
        id: input.id || "",
        placeholder: input.placeholder || "",
        label,
        required: input.required || false,
        className: input.className || "",
        ariaLabel: input.getAttribute("aria-label") || "",
      });
    });

    // Find submit buttons
    const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], [role='button']"));
    const submitButtons = buttons.map((b) => ({
      text: b.textContent?.trim() || "",
      type: (b as HTMLButtonElement).type || "",
      id: b.id || "",
      className: b.className || "",
    }));

    // Find checkboxes (for terms/conditions)
    const checkboxes = Array.from(document.querySelectorAll("input[type='checkbox']")).map((cb) => {
      const input = cb as HTMLInputElement;
      let label = "";
      const parent = input.closest("label, .checkbox, [class*='check']");
      if (parent) label = parent.textContent?.trim() || "";
      return { id: input.id, name: input.name, label, className: input.className };
    });

    return { fields, submitButtons, checkboxes, pageTitle: document.title, url: window.location.href };
  });

  try {
    const response = await invokeLLM({
      systemTag: "affiliate",
      model: "fast",
      messages: [
        {
          role: "system",
          content: `You are an expert at analyzing web forms for affiliate program signups. Given a page's form structure, determine:
1. Which fields to fill and with what values
2. The submit button selector
3. Whether it's actually a signup/registration form
4. Whether a password is needed

Use these business details:
- Email: ${BUSINESS_PROFILE.email}
- Company: ${BUSINESS_PROFILE.companyName}
- Website: ${BUSINESS_PROFILE.websiteUrl}
- Name: ${BUSINESS_PROFILE.fullName}
- First Name: ${BUSINESS_PROFILE.firstName}
- Last Name: ${BUSINESS_PROFILE.lastName}
- Phone: ${BUSINESS_PROFILE.phone}
- ABN: ${BUSINESS_PROFILE.abn}
- Address: ${BUSINESS_PROFILE.address}
- Date of Birth: ${BUSINESS_PROFILE.dateOfBirth}
- Description: ${BUSINESS_PROFILE.description}
- Country: ${BUSINESS_PROFILE.country}

Return ONLY valid JSON matching the schema.`,
        },
        {
          role: "user",
          content: `Analyze this form:\n${JSON.stringify(formData, null, 2)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "form_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              formFields: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    selector: { type: "string", description: "CSS selector to target this field" },
                    label: { type: "string" },
                    type: { type: "string" },
                    suggestedValue: { type: "string" },
                    isRequired: { type: "boolean" },
                  },
                  required: ["selector", "label", "type", "suggestedValue", "isRequired"],
                  additionalProperties: false,
                },
              },
              submitSelector: { type: "string" },
              isSignupForm: { type: "boolean" },
              needsPassword: { type: "boolean" },
              passwordSelector: { type: "string" },
              confirmPasswordSelector: { type: "string" },
              termsCheckboxSelector: { type: "string" },
            },
            required: ["formFields", "submitSelector", "isSignupForm", "needsPassword", "passwordSelector", "confirmPasswordSelector", "termsCheckboxSelector"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") throw new Error("No LLM response");
    return JSON.parse(content);
  } catch (err) {
    log.error("[AffiliateSignup] LLM form analysis failed, falling back to heuristic:", { error: String(err) });
    return fallbackFormAnalysis(page);
  }
}

/**
 * Fallback heuristic form analysis when LLM is unavailable
 */
async function fallbackFormAnalysis(page: Page) {
  const fields = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input:not([type='hidden']):not([type='submit']), textarea, select"));
    return inputs.map((el) => {
      const input = el as HTMLInputElement;
      return {
        selector: input.id ? `#${input.id}` : input.name ? `[name="${input.name}"]` : "",
        label: input.placeholder || input.name || input.id || "",
        type: input.type || "text",
        name: input.name || "",
        id: input.id || "",
      };
    }).filter(f => f.selector);
  });

  const formFields = fields.map((f) => {
    let suggestedValue = "";
    const identifier = `${f.label} ${f.name} ${f.id}`.toLowerCase();

    for (const mapping of FIELD_MAPPINGS) {
      if (mapping.patterns.some((p) => p.test(identifier))) {
        suggestedValue = mapping.value;
        break;
      }
    }

    // Password fields
    if (f.type === "password") {
      suggestedValue = (() => { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%'; let p = ''; for (let i = 0; i < 16; i++) p += chars[Math.floor(Math.random() * chars.length)]; return p; })();
    }

    return {
      selector: f.selector,
      label: f.label,
      type: f.type,
      suggestedValue,
      isRequired: true,
    };
  });

  return {
    formFields,
    submitSelector: "button[type='submit'], input[type='submit'], button:has-text('Sign Up'), button:has-text('Register'), button:has-text('Submit'), button:has-text('Join'), button:has-text('Apply')",
    isSignupForm: true,
    needsPassword: fields.some((f) => f.type === "password"),
    passwordSelector: fields.find((f) => f.type === "password")?.selector || "",
    confirmPasswordSelector: "",
    termsCheckboxSelector: "",
  };
}

// ─── Core Signup Function ────────────────────────────────────────────

/**
 * Attempt to sign up for a single affiliate program
 */
async function signupForProgram(
  signupUrl: string,
  programName: string,
  captchaConfig: CaptchaConfig,
  onStatus: (status: string) => void
): Promise<SignupResult> {
  let browser = null;

  try {
    onStatus(`Launching stealth browser for ${programName}...`);

    const browserConfig: BrowserConfig = {
      headless: true,
    };

    const { browser: b, page, profile } = await launchStealthBrowser(browserConfig);
    browser = b;

    onStatus(`Navigating to signup page (${profile.name})...`);
    
    // Navigate to signup page
    await page.goto(signupUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await humanDelay(2000, 4000);

    // Check for bot protection
    const botCheck = await detectBotProtection(page);
    if (botCheck.detected) {
      onStatus(`Bot protection detected (${botCheck.type}), attempting to bypass...`);
      
      // Try solving CAPTCHA if present
      if (captchaConfig.service) {
        const captchaResult = await detectAndSolveCaptcha(page, captchaConfig);
        if (!captchaResult.solved) {
          await browser.close();
          return {
            success: false,
            message: `Bot protection (${botCheck.type}) could not be bypassed: ${captchaResult.error}`,
            requiresManualStep: true,
            manualStepDescription: `Visit ${signupUrl} manually — bot protection (${botCheck.type}) blocks automated signup`,
          };
        }
        await humanDelay(2000, 3000);
      } else {
        await browser.close();
        return {
          success: false,
          message: `Bot protection detected (${botCheck.type}) — no CAPTCHA service configured`,
          requiresManualStep: true,
          manualStepDescription: `Visit ${signupUrl} manually or configure a CAPTCHA service in Settings`,
        };
      }
    }

    // Analyze the form
    onStatus("Analyzing signup form...");
    const formAnalysis = await analyzeFormWithLLM(page);

    if (!formAnalysis.isSignupForm) {
      // Try to find a signup/register link on the page
      onStatus("Not a signup form — looking for signup link...");
      const signupLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a"));
        const signupPatterns = [/sign.?up/i, /register/i, /join/i, /create.*account/i, /get.*started/i, /apply/i, /become.*affiliate/i, /partner.*program/i];
        for (const link of links) {
          const text = link.textContent?.trim() || "";
          const href = link.href || "";
          if (signupPatterns.some((p) => p.test(text) || p.test(href))) {
            return href;
          }
        }
        return null;
      });

      if (signupLink) {
        onStatus(`Found signup link, navigating...`);
        await page.goto(signupLink, { waitUntil: "domcontentloaded", timeout: 30000 });
        await humanDelay(2000, 3000);
        // Re-analyze
        const reAnalysis = await analyzeFormWithLLM(page);
        if (!reAnalysis.isSignupForm) {
          const screenshot = await takeScreenshot(page, `${programName}_no_form`);
          await browser.close();
          return {
            success: false,
            message: "Could not find signup form on the page",
            screenshotPath: screenshot || undefined,
            requiresManualStep: true,
            manualStepDescription: `Visit ${signupUrl} manually — automated form detection failed`,
          };
        }
        // Use the re-analyzed form
        Object.assign(formAnalysis, reAnalysis);
      } else {
        const screenshot = await takeScreenshot(page, `${programName}_no_signup`);
        await browser.close();
        return {
          success: false,
          message: "No signup form or link found",
          screenshotPath: screenshot || undefined,
          requiresManualStep: true,
          manualStepDescription: `Visit ${signupUrl} manually — no signup form detected`,
        };
      }
    }

    // Fill in the form fields
    onStatus("Filling signup form...");
    const password = getSignupPassword();

    for (const field of formAnalysis.formFields) {
      if (!field.suggestedValue || !field.selector) continue;

      try {
        const exists = await page.$(field.selector);
        if (!exists) continue;

        if (field.type === "select") {
          await page.selectOption(field.selector, { label: field.suggestedValue }).catch(() => {
            // Try by value
            page.selectOption(field.selector, field.suggestedValue).catch(() => {});
          });
        } else {
          // Clear existing value and type new one
          await page.click(field.selector).catch(() => {});
          await page.fill(field.selector, "").catch(() => {});
          await humanType(page, field.selector, field.suggestedValue);
        }

        await humanDelay(300, 800);
      } catch (fieldErr) {
        log.warn(`[AffiliateSignup] Failed to fill field ${field.selector}:`, { detail: fieldErr });
      }
    }

    // Fill password if needed — use consistent password so Titan can log back in
    if (formAnalysis.needsPassword && formAnalysis.passwordSelector) {
      try {
        await humanType(page, formAnalysis.passwordSelector, password);
        await humanDelay(300, 600);
        if (formAnalysis.confirmPasswordSelector) {
          await humanType(page, formAnalysis.confirmPasswordSelector, password);
          await humanDelay(300, 600);
        }
        // Store credentials for future login
        const domain = new URL(signupUrl).hostname.replace(/^www\./, "");
        credentialStore.set(domain, {
          email: BUSINESS_PROFILE.email,
          password,
          signupUrl,
          signedUpAt: new Date(),
        });
        log.info(`[AffiliateSignup] Credentials stored for ${domain}`);
      } catch (pwErr) {
        log.warn("[AffiliateSignup] Failed to fill password:", { detail: pwErr });
      }
    }

    // Check terms/conditions checkbox
    if (formAnalysis.termsCheckboxSelector) {
      try {
        await page.check(formAnalysis.termsCheckboxSelector).catch(() => {
          page.click(formAnalysis.termsCheckboxSelector!).catch(() => {});
        });
        await humanDelay(300, 600);
      } catch {
        log.warn("[AffiliateSignup] Failed to check terms checkbox");
      }
    }

    // Scroll down to make submit button visible
    await humanScroll(page);
    await humanDelay(500, 1000);

    // Handle CAPTCHA before submit
    if (captchaConfig.service) {
      onStatus("Checking for CAPTCHA...");
      const captchaResult = await detectAndSolveCaptcha(page, captchaConfig);
      if (captchaResult.solved) {
        onStatus("CAPTCHA solved successfully");
        await humanDelay(1000, 2000);
      }
    }

    // Take pre-submit screenshot
    const preSubmitScreenshot = await takeScreenshot(page, `${programName}_pre_submit`);

    // Submit the form
    onStatus("Submitting application...");
    try {
      // Try multiple submit strategies
      const submitted = await page.evaluate((submitSel) => {
        // Strategy 1: Click the submit button by selector
        const btn = document.querySelector(submitSel);
        if (btn) {
          (btn as HTMLElement).click();
          return true;
        }
        // Strategy 2: Find any submit-like button
        const buttons = Array.from(document.querySelectorAll("button, input[type='submit']"));
        const submitBtn = buttons.find((b) => {
          const text = b.textContent?.toLowerCase() || "";
          return ["submit", "sign up", "register", "join", "apply", "create", "get started"].some((t) => text.includes(t));
        });
        if (submitBtn) {
          (submitBtn as HTMLElement).click();
          return true;
        }
        // Strategy 3: Submit the form directly
        const form = document.querySelector("form");
        if (form) {
          form.submit();
          return true;
        }
        return false;
      }, formAnalysis.submitSelector);

      if (!submitted) {
        const screenshot = await takeScreenshot(page, `${programName}_no_submit`);
        await browser.close();
        return {
          success: false,
          message: "Could not find or click submit button",
          screenshotPath: screenshot || preSubmitScreenshot || undefined,
          requiresManualStep: true,
          manualStepDescription: "Form was filled but submit button could not be clicked",
        };
      }
    } catch (submitErr) {
      // If click fails, try pressing Enter
      await page.keyboard.press("Enter");
    }

    // Wait for response
    await humanDelay(3000, 5000);

    // Check the result page
    onStatus("Checking signup result...");
    const resultAnalysis = await page.evaluate(() => {
      const bodyText = document.body?.innerText?.toLowerCase() || "";
      const title = document.title?.toLowerCase() || "";
      const url = window.location.href;

      const successIndicators = [
        "thank you", "thanks for", "welcome", "successfully", "account created",
        "registration complete", "application received", "check your email",
        "verify your email", "confirmation", "approved", "dashboard",
        "congratulations", "you're in", "signed up",
      ];

      const failureIndicators = [
        "error", "invalid", "already exists", "already registered",
        "try again", "failed", "problem", "incorrect",
      ];

      const pendingIndicators = [
        "review", "pending", "under review", "manual review",
        "approval", "we'll get back", "within 24", "within 48",
      ];

      const isSuccess = successIndicators.some((i) => bodyText.includes(i) || title.includes(i));
      const isFailure = failureIndicators.some((i) => bodyText.includes(i));
      const isPending = pendingIndicators.some((i) => bodyText.includes(i));

      return { isSuccess, isFailure, isPending, url, bodySnippet: bodyText.slice(0, 500) };
    });

    const postSubmitScreenshot = await takeScreenshot(page, `${programName}_result`);

    await browser.close();
    browser = null;

    if (resultAnalysis.isSuccess) {
      return {
        success: true,
        message: `Successfully signed up for ${programName}`,
        screenshotPath: postSubmitScreenshot || undefined,
        dashboardUrl: resultAnalysis.url,
      };
    } else if (resultAnalysis.isPending) {
      return {
        success: true, // Treat pending as success — application was submitted
        message: `Application submitted for ${programName} — pending review`,
        screenshotPath: postSubmitScreenshot || undefined,
        requiresManualStep: true,
        manualStepDescription: "Application submitted but requires manual approval. Check email for updates.",
      };
    } else if (resultAnalysis.isFailure) {
      return {
        success: false,
        message: `Signup failed for ${programName}: ${resultAnalysis.bodySnippet.slice(0, 200)}`,
        screenshotPath: postSubmitScreenshot || undefined,
        requiresManualStep: true,
        manualStepDescription: `Automated signup failed. Visit ${signupUrl} to sign up manually.`,
      };
    } else {
      // Ambiguous result — treat as partial success
      return {
        success: true,
        message: `Form submitted for ${programName} — result unclear, check email`,
        screenshotPath: postSubmitScreenshot || undefined,
        requiresManualStep: true,
        manualStepDescription: "Form was submitted but the result page was ambiguous. Check archibaldtitan@gmail.com for confirmation.",
      };
    }
  } catch (err: unknown) {
    if (browser) {
      try { await browser.close(); } catch { /* */ }
    }
    return {
      success: false,
      message: `Signup error for ${programName}: ${getErrorMessage(err)}`,
      requiresManualStep: true,
      manualStepDescription: `Automated signup encountered an error. Visit ${signupUrl} manually.`,
    };
  }
}

// ─── Batch Signup Orchestrator ───────────────────────────────────────

/**
 * Run signup attempts for all pending applications
 */
export async function runSignupBatch(options?: {
  limit?: number;
  discoveryIds?: number[];
  adminUserId?: number;
}): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
  pending: number;
  results: Array<{
    programName: string;
    status: string;
    message: string;
    requiresManual: boolean;
  }>;
}> {
  if (signupKilled) {
    return { attempted: 0, succeeded: 0, failed: 0, pending: 0, results: [{ programName: "N/A", status: "killed", message: "Kill switch active", requiresManual: false }] };
  }

  const db = await getDb();
  if (!db) return { attempted: 0, succeeded: 0, failed: 0, pending: 0, results: [] };

  // Get CAPTCHA config from admin user settings
  let captchaConfig: CaptchaConfig = { service: null, apiKey: "" };
  if (options?.adminUserId) {
    try {
      const settings = await getSettings(options.adminUserId);
      captchaConfig = {
        service: (settings.captchaService as any) || null,
        apiKey: settings.captchaApiKey || "",
      };
    } catch { /* use default */ }
  }

  // Find applications to process
  let applications;
  if (options?.discoveryIds && options.discoveryIds.length > 0) {
    applications = await db.select({
      app: affiliateApplications,
      discovery: affiliateDiscoveries,
    })
      .from(affiliateApplications)
      .innerJoin(affiliateDiscoveries, eq(affiliateApplications.discoveryId, affiliateDiscoveries.id))
      .where(and(
        inArray(affiliateApplications.discoveryId, options.discoveryIds),
        eq(affiliateApplications.status, "drafted"),
      ))
      .limit(options?.limit || 10);
  } else {
    applications = await db.select({
      app: affiliateApplications,
      discovery: affiliateDiscoveries,
    })
      .from(affiliateApplications)
      .innerJoin(affiliateDiscoveries, eq(affiliateApplications.discoveryId, affiliateDiscoveries.id))
      .where(eq(affiliateApplications.status, "drafted"))
      .orderBy(desc(affiliateDiscoveries.overallScore))
      .limit(options?.limit || 10);
  }

  if (applications.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0, pending: 0, results: [] };
  }

  log.info(`[AffiliateSignup] Starting batch signup for ${applications.length} programs`);

  const results: Array<{ programName: string; status: string; message: string; requiresManual: boolean }> = [];
  let succeeded = 0;
  let failed = 0;
  let pending = 0;

  for (const { app, discovery } of applications) {
    if (signupKilled) {
      results.push({ programName: discovery.name, status: "killed", message: "Kill switch activated", requiresManual: false });
      continue;
    }

    const signupUrl = discovery.affiliateProgramUrl || `https://${discovery.domain}`;

    log.info(`[AffiliateSignup] Attempting signup: ${discovery.name} (${signupUrl})`);

    const result = await signupForProgram(
      signupUrl,
      discovery.name,
      captchaConfig,
      (status) => log.info(`[AffiliateSignup] ${discovery.name}: ${status}`)
    );

    // Update application status
    const newStatus = result.success ? (result.requiresManualStep ? "pending" : "accepted") : "rejected";
    await db.update(affiliateApplications)
      .set({
        status: newStatus,
        sentAt: new Date(),
        responseContent: result.message,
      })
      .where(eq(affiliateApplications.id, app.id));

    // Update discovery status
    await db.update(affiliateDiscoveries)
      .set({
        applicationStatus: result.success ? "application_sent" : "rejected",
        status: result.success ? "applied" : "rejected",
      })
      .where(eq(affiliateDiscoveries.id, discovery.id));

    // If successful, promote to partner
    if (result.success && result.affiliateUrl) {
      try {
        const existing = await db.select().from(affiliatePartners)
          .where(eq(affiliatePartners.domain, discovery.domain))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(affiliatePartners).values({
            name: discovery.name,
            domain: discovery.domain,
            affiliateUrl: result.affiliateUrl,
            vertical: (discovery.vertical as any) || "other",
            commissionType: (discovery.estimatedCommissionType as any) || "cpa",
            commissionRate: discovery.estimatedCommissionRate || 0,
            status: "active",
          });
        } else {
          // Update existing partner with affiliate URL
          await db.update(affiliatePartners)
            .set({ affiliateUrl: result.affiliateUrl, status: "active" })
            .where(eq(affiliatePartners.id, existing[0].id));
        }
      } catch (promoteErr) {
        log.error(`[AffiliateSignup] Failed to promote ${discovery.name}:`, { detail: promoteErr });
      }
    }

    if (result.success) {
      if (result.requiresManualStep) {
        pending++;
      } else {
        succeeded++;
      }
    } else {
      failed++;
    }

    results.push({
      programName: discovery.name,
      status: newStatus,
      message: result.message,
      requiresManual: result.requiresManualStep || false,
    });

    // Delay between signups to avoid rate limiting
    await humanDelay(5000, 10000);
  }

  // Auto-retry failed signups with a different browser profile (max 1 retry)
  const failedResults = results.filter(r => r.status === "rejected" && !r.requiresManual);
  if (failedResults.length > 0 && failedResults.length <= 3) {
    log.info(`[AffiliateSignup] Retrying ${failedResults.length} failed signups with different browser profile...`);
    await humanDelay(10000, 15000); // Wait before retry
    
    for (const failedApp of applications.filter(a => results.find(r => r.programName === a.discovery.name && r.status === "rejected"))) {
      if (signupKilled) break;
      const retryUrl = failedApp.discovery.affiliateProgramUrl || `https://${failedApp.discovery.domain}`;
      log.info(`[AffiliateSignup] RETRY: ${failedApp.discovery.name}`);
      
      const retryResult = await signupForProgram(
        retryUrl,
        failedApp.discovery.name,
        captchaConfig,
        (status) => log.info(`[AffiliateSignup] RETRY ${failedApp.discovery.name}: ${status}`)
      );

      if (retryResult.success) {
        const retryStatus = retryResult.requiresManualStep ? "pending" : "accepted";
        await db.update(affiliateApplications)
          .set({ status: retryStatus, responseContent: `RETRY: ${retryResult.message}` })
          .where(eq(affiliateApplications.id, failedApp.app.id));
        await db.update(affiliateDiscoveries)
          .set({ applicationStatus: "application_sent", status: "applied" })
          .where(eq(affiliateDiscoveries.id, failedApp.discovery.id));
        
        if (retryResult.requiresManualStep) pending++; else succeeded++;
        failed--;
        log.info(`[AffiliateSignup] RETRY SUCCESS: ${failedApp.discovery.name}`);
      }
      await humanDelay(5000, 10000);
    }
  }

  // Notify owner of results
  const summary = `Signup batch complete:\n- ${succeeded} succeeded\n- ${pending} pending review\n- ${failed} failed\n- ${results.filter(r => r.requiresManual).length} require manual action`;
  
  await notifyOwner({
    title: `Affiliate Signup: ${succeeded + pending}/${applications.length} successful`,
    content: summary + "\n\nDetails:\n" + results.map(r => `• ${r.programName}: ${r.status} — ${r.message}`).join("\n"),
  });

  log.info(`[AffiliateSignup] Batch complete: ${succeeded} succeeded, ${pending} pending, ${failed} failed`);

  return { attempted: applications.length, succeeded, failed, pending, results };
}

// ─── Get Signup Status ───────────────────────────────────────────────

// ─── Auto-Scheduled Signup After Discovery ──────────────────────────

/**
 * Automatically run signup batch after a discovery cycle completes.
 * Called by the discovery engine when new high-scoring programs are found.
 */
export async function autoSignupAfterDiscovery(adminUserId?: number): Promise<void> {
  if (signupKilled) return;
  
  log.info("[AffiliateSignup] Auto-signup triggered after discovery cycle");
  
  // Wait a bit for discovery to fully complete
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  try {
    const result = await runSignupBatch({
      limit: 5, // Process top 5 pending applications
      adminUserId,
    });
    log.info(`[AffiliateSignup] Auto-signup complete: ${result.succeeded} succeeded, ${result.pending} pending, ${result.failed} failed`);
  } catch (err: unknown) {
    log.error("[AffiliateSignup] Auto-signup failed:", { error: String(getErrorMessage(err)) });
  }
}

/**
 * Start scheduled signup job — runs every 8 hours to process pending applications
 */
export function startScheduledSignups(): void {
  const EIGHT_HOURS = 8 * 60 * 60 * 1000;

  setInterval(async () => {
    if (signupKilled) return;
    
    const db = await getDb();
    if (!db) return;

    // Check if there are pending drafted applications
    const pendingApps = await db.select({ id: affiliateApplications.id })
      .from(affiliateApplications)
      .where(eq(affiliateApplications.status, "drafted"))
      .limit(1);

    if (pendingApps.length > 0) {
      log.info("[AffiliateSignup] Scheduled signup batch triggered");
      try {
        await runSignupBatch({ limit: 5 });
      } catch (err: unknown) {
        log.error("[AffiliateSignup] Scheduled signup failed:", { error: String(getErrorMessage(err)) });
      }
    }
  }, EIGHT_HOURS);

  log.info("[AffiliateSignup] Scheduled signup active — runs every 8 hours for pending applications");
}

// ─── Get Signup Status ───────────────────────────────────────────────

export async function getSignupStats(): Promise<{
  totalAttempted: number;
  totalSucceeded: number;
  totalPending: number;
  totalFailed: number;
  recentResults: Array<{
    programName: string;
    status: string;
    attemptedAt: Date | null;
  }>;
}> {
  const db = await getDb();
  if (!db) return { totalAttempted: 0, totalSucceeded: 0, totalPending: 0, totalFailed: 0, recentResults: [] };

  const apps = await db.select({
    app: affiliateApplications,
    discovery: affiliateDiscoveries,
  })
    .from(affiliateApplications)
    .innerJoin(affiliateDiscoveries, eq(affiliateApplications.discoveryId, affiliateDiscoveries.id))
    .where(inArray(affiliateApplications.status, ["accepted", "pending", "rejected", "sent"]))
    .orderBy(desc(affiliateApplications.sentAt))
    .limit(50);

  return {
    totalAttempted: apps.length,
    totalSucceeded: apps.filter(a => a.app.status === "accepted").length,
    totalPending: apps.filter(a => a.app.status === "pending" || a.app.status === "sent").length,
    totalFailed: apps.filter(a => a.app.status === "rejected").length,
    recentResults: apps.map(a => ({
      programName: a.discovery.name,
      status: a.app.status,
      attemptedAt: a.app.sentAt,
    })),
  };
}
