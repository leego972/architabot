/**
 * CAPTCHA Solver Module
 * Integrates with 2Captcha and Anti-Captcha services to solve
 * reCAPTCHA v2/v3, hCaptcha, and image CAPTCHAs automatically.
 */
import type { Page } from "playwright";
import { createLogger } from "../_core/logger.js";
const log = createLogger("CaptchaSolver");

export type CaptchaService = "2captcha" | "anticaptcha" | null;

export interface CaptchaConfig {
  service: CaptchaService;
  apiKey: string;
}

interface CaptchaResult {
  solved: boolean;
  token?: string;
  error?: string;
}

// ─── 2Captcha API ─────────────────────────────────────────────────────
async function solve2Captcha(
  siteKey: string,
  pageUrl: string,
  apiKey: string,
  type: "recaptcha_v2" | "recaptcha_v3" | "hcaptcha" = "recaptcha_v2"
): Promise<CaptchaResult> {
  try {
    const methodMap = {
      recaptcha_v2: "userrecaptcha",
      recaptcha_v3: "userrecaptcha",
      hcaptcha: "hcaptcha",
    };

    const params = new URLSearchParams({
      key: apiKey,
      method: methodMap[type],
      googlekey: siteKey,
      pageurl: pageUrl,
      json: "1",
    });

    if (type === "recaptcha_v3") {
      params.set("version", "v3");
      params.set("action", "verify");
      params.set("min_score", "0.7");
    }

    // Submit CAPTCHA
    const submitRes = await fetch(`https://2captcha.com/in.php?${params.toString()}`);
    const submitData = await submitRes.json();

    if (submitData.status !== 1) {
      return { solved: false, error: `2Captcha submit error: ${submitData.request}` };
    }

    const taskId = submitData.request;

    // Poll for result (max 120 seconds)
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const resultRes = await fetch(
        `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`
      );
      const resultData = await resultRes.json();

      if (resultData.status === 1) {
        return { solved: true, token: resultData.request };
      }
      if (resultData.request !== "CAPCHA_NOT_READY") {
        return { solved: false, error: `2Captcha result error: ${resultData.request}` };
      }
    }

    return { solved: false, error: "2Captcha timeout after 120 seconds" };
  } catch (err) {
    return { solved: false, error: `2Captcha error: ${err}` };
  }
}

// ─── Anti-Captcha API ─────────────────────────────────────────────────
async function solveAntiCaptcha(
  siteKey: string,
  pageUrl: string,
  apiKey: string,
  type: "recaptcha_v2" | "recaptcha_v3" | "hcaptcha" = "recaptcha_v2"
): Promise<CaptchaResult> {
  try {
    const typeMap = {
      recaptcha_v2: "RecaptchaV2TaskProxyless",
      recaptcha_v3: "RecaptchaV3TaskProxyless",
      hcaptcha: "HCaptchaTaskProxyless",
    };

    const taskPayload: Record<string, unknown> = {
      clientKey: apiKey,
      task: {
        type: typeMap[type],
        websiteURL: pageUrl,
        websiteKey: siteKey,
      },
    };

    if (type === "recaptcha_v3") {
      (taskPayload.task as Record<string, unknown>).minScore = 0.7;
      (taskPayload.task as Record<string, unknown>).pageAction = "verify";
    }

    // Create task
    const createRes = await fetch("https://api.anti-captcha.com/createTask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskPayload),
    });
    const createData = await createRes.json();

    if (createData.errorId !== 0) {
      return { solved: false, error: `Anti-Captcha error: ${createData.errorDescription}` };
    }

    const taskId = createData.taskId;

    // Poll for result (max 120 seconds)
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const resultRes = await fetch("https://api.anti-captcha.com/getTaskResult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: apiKey, taskId }),
      });
      const resultData = await resultRes.json();

      if (resultData.status === "ready") {
        const token =
          resultData.solution?.gRecaptchaResponse || resultData.solution?.token;
        return { solved: true, token };
      }
      if (resultData.errorId !== 0) {
        return { solved: false, error: `Anti-Captcha error: ${resultData.errorDescription}` };
      }
    }

    return { solved: false, error: "Anti-Captcha timeout after 120 seconds" };
  } catch (err) {
    return { solved: false, error: `Anti-Captcha error: ${err}` };
  }
}

// ─── Image CAPTCHA Solver ─────────────────────────────────────────────
async function solveImageCaptcha2Captcha(
  base64Image: string,
  apiKey: string
): Promise<CaptchaResult> {
  try {
    const submitRes = await fetch("https://2captcha.com/in.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        key: apiKey,
        method: "base64",
        body: base64Image,
        json: "1",
      }),
    });
    const submitData = await submitRes.json();

    if (submitData.status !== 1) {
      return { solved: false, error: `Image CAPTCHA submit error: ${submitData.request}` };
    }

    const taskId = submitData.request;

    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const resultRes = await fetch(
        `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`
      );
      const resultData = await resultRes.json();
      if (resultData.status === 1) {
        return { solved: true, token: resultData.request };
      }
      if (resultData.request !== "CAPCHA_NOT_READY") {
        return { solved: false, error: `Image CAPTCHA error: ${resultData.request}` };
      }
    }

    return { solved: false, error: "Image CAPTCHA timeout" };
  } catch (err) {
    return { solved: false, error: `Image CAPTCHA error: ${err}` };
  }
}

// ─── Page CAPTCHA Detection & Solving ─────────────────────────────────
export async function detectAndSolveCaptcha(
  page: Page,
  config: CaptchaConfig
): Promise<CaptchaResult> {
  if (!config.service || !config.apiKey) {
    return { solved: false, error: "No CAPTCHA service configured" };
  }

  const pageUrl = page.url();

  // Detect reCAPTCHA v2
  const recaptchaV2SiteKey = await page.evaluate(() => {
    const el = document.querySelector(".g-recaptcha, [data-sitekey]");
    return el?.getAttribute("data-sitekey") || null;
  });

  if (recaptchaV2SiteKey) {
    log.info("[CAPTCHA] Detected reCAPTCHA v2, solving...");
    const result =
      config.service === "2captcha"
        ? await solve2Captcha(recaptchaV2SiteKey, pageUrl, config.apiKey, "recaptcha_v2")
        : await solveAntiCaptcha(recaptchaV2SiteKey, pageUrl, config.apiKey, "recaptcha_v2");

    if (result.solved && result.token) {
      await page.evaluate((token) => {
        const textarea = document.getElementById("g-recaptcha-response") as HTMLTextAreaElement;
        if (textarea) {
          textarea.style.display = "block";
          textarea.value = token;
        }
        // Trigger callback if exists
        const callback = (window as any).___grecaptcha_cfg?.clients?.[0]?.aa?.l?.callback;
        if (callback) callback(token);
      }, result.token);
    }
    return result;
  }

  // Detect reCAPTCHA v3
  const recaptchaV3SiteKey = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll("script[src*='recaptcha']"));
    for (const script of scripts) {
      const src = script.getAttribute("src") || "";
      const match = src.match(/render=([^&]+)/);
      if (match) return match[1];
    }
    return null;
  });

  if (recaptchaV3SiteKey) {
    log.info("[CAPTCHA] Detected reCAPTCHA v3, solving...");
    const result =
      config.service === "2captcha"
        ? await solve2Captcha(recaptchaV3SiteKey, pageUrl, config.apiKey, "recaptcha_v3")
        : await solveAntiCaptcha(recaptchaV3SiteKey, pageUrl, config.apiKey, "recaptcha_v3");

    if (result.solved && result.token) {
      await page.evaluate((token) => {
        const input = document.querySelector('input[name="g-recaptcha-response"]') as HTMLInputElement;
        if (input) input.value = token;
      }, result.token);
    }
    return result;
  }

  // Detect hCaptcha
  const hcaptchaSiteKey = await page.evaluate(() => {
    const el = document.querySelector(".h-captcha, [data-sitekey]");
    return el?.getAttribute("data-sitekey") || null;
  });

  if (hcaptchaSiteKey) {
    log.info("[CAPTCHA] Detected hCaptcha, solving...");
    const result =
      config.service === "2captcha"
        ? await solve2Captcha(hcaptchaSiteKey, pageUrl, config.apiKey, "hcaptcha")
        : await solveAntiCaptcha(hcaptchaSiteKey, pageUrl, config.apiKey, "hcaptcha");

    if (result.solved && result.token) {
      await page.evaluate((token) => {
        const textarea = document.querySelector('[name="h-captcha-response"]') as HTMLTextAreaElement;
        if (textarea) textarea.value = token;
        const iframe = document.querySelector('iframe[src*="hcaptcha"]');
        if (iframe) {
          (iframe as HTMLIFrameElement).contentWindow?.postMessage(
            JSON.stringify({ type: "hcaptcha-solve", token }),
            "*"
          );
        }
      }, result.token);
    }
    return result;
  }

  // Detect image CAPTCHA
  const imageCaptchaBase64 = await page.evaluate(() => {
    const img = document.querySelector('img[alt*="captcha" i], img[src*="captcha" i], img.captcha');
    if (!img) return null;
    const canvas = document.createElement("canvas");
    const imgEl = img as HTMLImageElement;
    canvas.width = imgEl.naturalWidth || imgEl.width;
    canvas.height = imgEl.naturalHeight || imgEl.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(imgEl, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  });

  if (imageCaptchaBase64 && config.service === "2captcha") {
    log.info("[CAPTCHA] Detected image CAPTCHA, solving...");
    return solveImageCaptcha2Captcha(imageCaptchaBase64, config.apiKey);
  }

  return { solved: false, error: "No CAPTCHA detected on page" };
}

// ─── Bot Detection Check ──────────────────────────────────────────────
export async function detectBotProtection(page: Page): Promise<{
  detected: boolean;
  type: string | null;
}> {
  const checks = await page.evaluate(() => {
    const bodyText = document.body?.innerText?.toLowerCase() || "";
    const title = document.title?.toLowerCase() || "";

    // Akamai Bot Manager
    if (bodyText.includes("your browser is behaving strangely") || bodyText.includes("access denied")) {
      return { detected: true, type: "akamai" };
    }
    // Cloudflare
    if (bodyText.includes("checking your browser") || title.includes("just a moment")) {
      return { detected: true, type: "cloudflare" };
    }
    // PerimeterX
    if (bodyText.includes("press & hold") || bodyText.includes("human verification")) {
      return { detected: true, type: "perimeterx" };
    }
    // DataDome
    if (bodyText.includes("datadome") || document.querySelector('iframe[src*="datadome"]')) {
      return { detected: true, type: "datadome" };
    }
    // Generic
    if (bodyText.includes("are you a robot") || bodyText.includes("verify you are human")) {
      return { detected: true, type: "generic" };
    }

    return { detected: false, type: null };
  });

  return checks;
}
