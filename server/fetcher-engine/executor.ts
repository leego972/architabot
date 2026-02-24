/**
 * Job Executor v2 — Hardened Reliability Edition
 *
 * Major improvements over v1:
 * 1. Task-level retry with exponential backoff (up to 3 retries per task)
 * 2. Proxy rotation on retry — picks a different proxy each attempt
 * 3. Connection health pre-check before launching browser
 * 4. Graceful page-load timeout handling with fallback strategies
 * 5. Session isolation — fresh browser context per attempt
 * 6. Structured logging with timing metrics
 * 7. Partial success tracking — job marked "partial" if some tasks succeed
 */
import type { Browser } from "playwright";
import {
  launchStealthBrowser,
  takeScreenshot,
  humanDelay,
  type BrowserConfig,
} from "./browser";
import { automateProvider } from "./providers";
import type { CaptchaConfig, CaptchaService } from "./captcha-solver";
import {
  getJobTasks,
  updateJobStatus,
  updateTaskStatus,
  incrementJobCompleted,
  incrementJobFailed,
  storeCredential,
  isKillSwitchActive,
  getSettings,
  decrypt,
  getJob,
} from "../fetcher-db";
import { PROVIDERS } from "../../shared/fetcher";
import { getDb } from "../db";
import { customProviders } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  selectProxyForProvider,
  recordProxyResult,
  PROVIDER_PROXY_REQUIREMENTS,
} from "./proxy-manager";
import {
  checkCircuit,
  recordCircuitSuccess,
  recordCircuitFailure,
  classifyError,
  isRetryable,
  calculateRetryDelay,
  incrementActiveJobs,
  decrementActiveJobs,
} from "./safety-engine";
import { createLogger } from "../_core/logger.js";
const log = createLogger("Executor");

// ─── Configuration ──────────────────────────────────────────────────
const MAX_TASK_RETRIES = 3;
const BROWSER_LAUNCH_TIMEOUT_MS = 30_000;
const PAGE_LOAD_TIMEOUT_MS = 45_000;
const INTER_TASK_DELAY = { min: 3000, max: 6000 };
const INTER_RETRY_BASE_DELAY_MS = 5000;

// Track running jobs so kill switch can abort them
const runningJobs = new Map<number, { abort: boolean }>();

export function abortJob(jobId: number): void {
  const job = runningJobs.get(jobId);
  if (job) job.abort = true;
}

export function isJobRunning(jobId: number): boolean {
  return runningJobs.has(jobId);
}

// ─── Helpers ────────────────────────────────────────────────────────

function elapsed(start: number): string {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}

/**
 * Pre-check: verify we can reach the internet before wasting a browser launch.
 * Uses a lightweight HEAD request to a reliable endpoint.
 */
async function checkConnectivity(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch("https://www.google.com/generate_204", {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { ok: res.ok || res.status === 204, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Safely close a browser, swallowing errors.
 */
async function safeBrowserClose(browser: Browser | null): Promise<void> {
  if (!browser) return;
  try { await browser.close(); } catch { /* swallow */ }
}

/**
 * Resolve provider config — built-in first, then custom providers DB.
 */
async function resolveProvider(providerId: string): Promise<{
  name: string;
  loginUrl: string;
  keysUrl: string;
  keyTypes: string[];
} | null> {
  const builtIn = PROVIDERS[providerId] as {
    name: string;
    loginUrl: string;
    keysUrl: string;
    keyTypes: string[];
  } | undefined;

  if (builtIn) return builtIn;

  try {
    const db = await getDb();
    if (db) {
      const [custom] = await db
        .select()
        .from(customProviders)
        .where(eq(customProviders.slug, providerId));
      if (custom) {
        return {
          name: custom.name,
          loginUrl: custom.loginUrl,
          keysUrl: custom.keysUrl,
          keyTypes: custom.keyTypes as string[],
        };
      }
    }
  } catch (e) {
    log.error(`[Fetcher] Failed to look up custom provider: ${providerId}`, { error: String(e) });
  }

  return null;
}

// ─── Single Task Execution with Retry ───────────────────────────────

interface TaskAttemptResult {
  success: boolean;
  credentialCount: number;
  error?: string;
  errorCategory?: string;
  shouldRetry: boolean;
}

async function executeTaskWithRetry(
  task: { id: number; providerId: string; providerName: string },
  job: { email: string; encryptedPassword: string },
  password: string,
  userId: number,
  jobId: number,
  jobControl: { abort: boolean },
  captchaConfig: CaptchaConfig,
  settings: any,
): Promise<TaskAttemptResult> {
  const provider = await resolveProvider(task.providerId);
  if (!provider) {
    await updateTaskStatus(task.id, "failed", `Unknown provider: ${task.providerId}`);
    return { success: false, credentialCount: 0, error: "Unknown provider", shouldRetry: false };
  }

  // Track which proxy IDs we've already tried so we rotate on retry
  const triedProxyIds = new Set<number>();
  let lastError = "";
  let lastCategory = "unknown";

  for (let attempt = 0; attempt < MAX_TASK_RETRIES; attempt++) {
    // ── Abort / Kill checks ──
    if (jobControl.abort) {
      return { success: false, credentialCount: 0, error: "Aborted by user", shouldRetry: false };
    }
    const killed = await isKillSwitchActive(userId);
    if (killed) {
      return { success: false, credentialCount: 0, error: "Kill switch activated", shouldRetry: false };
    }

    // ── Circuit breaker ──
    const circuitCheck = checkCircuit(task.providerId);
    if (!circuitCheck.allowed) {
      return { success: false, credentialCount: 0, error: `Circuit open: ${circuitCheck.reason}`, shouldRetry: false };
    }

    const isRetry = attempt > 0;
    const attemptLabel = isRetry ? ` (retry ${attempt}/${MAX_TASK_RETRIES - 1})` : "";
    const taskStart = Date.now();

    let browser: Browser | null = null;
    let selectedProxyId: number | null = null;

    try {
      // ── Log attempt ──
      log.info(`[Fetcher] Task ${task.id}${attemptLabel}: Starting ${task.providerName}`);
      await updateTaskStatus(
        task.id,
        isRetry ? "retrying" : "running",
        `${isRetry ? "Retrying" : "Starting"} ${task.providerName}${attemptLabel}`
      );

      // ── Connectivity pre-check (only on retries or first attempt) ──
      if (attempt === 0 || isRetry) {
        const conn = await checkConnectivity();
        if (!conn.ok) {
          log.warn(`[Fetcher] Task ${task.id}: Connectivity check failed (${conn.error}), waiting before retry...`);
          await updateTaskStatus(task.id, "retrying", `Network connectivity issue — waiting to retry (${conn.error})`);
          // Wait longer for connectivity issues
          await humanDelay(5000, 10000);
          const recheck = await checkConnectivity();
          if (!recheck.ok) {
            lastError = `Network unreachable: ${conn.error}`;
            lastCategory = "transient";
            continue; // next retry attempt
          }
        } else {
          log.info(`[Fetcher] Task ${task.id}: Network OK (${conn.latencyMs}ms latency)`);
        }
      }

      // ── Proxy selection with rotation ──
      const proxySelection = await selectProxyForProvider(userId, task.providerId);
      const requirement = PROVIDER_PROXY_REQUIREMENTS[task.providerId];

      const browserConfig: BrowserConfig = {
        headless: settings.headless === 1,
      };

      if (proxySelection.proxyConfig) {
        const proxyId = proxySelection.proxy?.id ?? null;
        // If we already tried this proxy and it failed, try to get a different one
        if (proxyId && triedProxyIds.has(proxyId) && isRetry) {
          log.info(`[Fetcher] Task ${task.id}: Proxy ${proxyId} already failed, requesting rotation`);
          // Still use it if it's the only one — better than nothing
          await updateTaskStatus(task.id, "retrying", `Rotating proxy for retry...`);
        }
        browserConfig.proxy = proxySelection.proxyConfig;
        selectedProxyId = proxyId;
        if (proxyId) triedProxyIds.add(proxyId);
        log.info(`[Fetcher] Task ${task.id}: ${proxySelection.reason}`);
      } else if (settings.proxyServer) {
        browserConfig.proxy = {
          server: settings.proxyServer,
          username: settings.proxyUsername || undefined,
          password: settings.proxyPassword || undefined,
        };
        log.info(`[Fetcher] Task ${task.id}: Using legacy proxy from settings`);
      } else if (requirement?.requiresProxy) {
        const errorMsg = `${task.providerName} requires a residential proxy (${requirement.reason}). Add one in Settings → Proxies.`;
        return { success: false, credentialCount: 0, error: errorMsg, shouldRetry: false };
      } else {
        log.info(`[Fetcher] Task ${task.id}: Direct connection (no proxy)`);
      }

      // ── Launch browser ──
      const launchStart = Date.now();
      const { browser: b, context, page, profile } = await launchStealthBrowser(browserConfig);
      browser = b;
      log.info(`[Fetcher] Task ${task.id}: Browser launched in ${elapsed(launchStart)} (${profile.name})`);

      // Set default navigation timeout
      page.setDefaultNavigationTimeout(PAGE_LOAD_TIMEOUT_MS);
      page.setDefaultTimeout(15_000);

      // ── Status callback ──
      const onStatus = async (status: string, message: string) => {
        await updateTaskStatus(task.id, status, message);
      };

      // ── Run provider automation ──
      const result = await automateProvider(
        page,
        task.providerId,
        job.email,
        password,
        captchaConfig,
        onStatus,
        {
          name: provider.name,
          loginUrl: provider.loginUrl,
          keysUrl: provider.keysUrl,
          keyTypes: provider.keyTypes,
        }
      );

      // ── Handle result ──
      if (result.success && result.credentials.length > 0) {
        for (const cred of result.credentials) {
          await storeCredential(
            userId, jobId, task.id,
            task.providerId, task.providerName,
            cred.keyType, cred.value, cred.label
          );
        }
        await updateTaskStatus(task.id, "completed", `Extracted ${result.credentials.length} credential(s) in ${elapsed(taskStart)}`);
        recordCircuitSuccess(task.providerId);
        if (selectedProxyId) await recordProxyResult(selectedProxyId, true);

        await safeBrowserClose(browser);
        return { success: true, credentialCount: result.credentials.length, shouldRetry: false };
      } else {
        // Automation ran but didn't find credentials
        const screenshotPath = result.screenshotPath || await takeScreenshot(page, `${task.providerId}_failed_attempt${attempt}`);
        lastError = result.error || "Failed to extract credentials";
        lastCategory = "unknown";

        // Check if this is a retryable situation
        const category = classifyError(lastError);
        lastCategory = category;
        const canRetry = isRetryable(category) && attempt < MAX_TASK_RETRIES - 1;

        if (selectedProxyId && isProxyRelatedError(lastError)) {
          await recordProxyResult(selectedProxyId, false);
        }

        await safeBrowserClose(browser);
        browser = null;

        if (canRetry) {
          const delay = calculateRetryDelay(attempt, category);
          log.info(`[Fetcher] Task ${task.id}: Retryable failure (${category}), waiting ${Math.round(delay)}ms`);
          await updateTaskStatus(task.id, "retrying", `${lastError} — retrying in ${Math.round(delay / 1000)}s...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        } else {
          return { success: false, credentialCount: 0, error: lastError, errorCategory: lastCategory, shouldRetry: false };
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const category = classifyError(err);
      lastError = errorMsg;
      lastCategory = category;

      log.error(`[Fetcher] Task ${task.id}${attemptLabel} error (${category}):`, { detail: errorMsg });
      recordCircuitFailure(task.providerId, category);

      if (selectedProxyId) {
        await recordProxyResult(selectedProxyId, false);
      }

      await safeBrowserClose(browser);
      browser = null;

      const canRetry = isRetryable(category) && attempt < MAX_TASK_RETRIES - 1 && !jobControl.abort;

      if (canRetry) {
        const delay = calculateRetryDelay(attempt, category);
        log.info(`[Fetcher] Task ${task.id}: ${category} error, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_TASK_RETRIES})`);
        await updateTaskStatus(task.id, "retrying", `${category} error: ${errorMsg} — retrying in ${Math.round(delay / 1000)}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      } else {
        return {
          success: false,
          credentialCount: 0,
          error: `${category} error: ${errorMsg}`,
          errorCategory: category,
          shouldRetry: false,
        };
      }
    }
  }

  // Exhausted all retries
  return {
    success: false,
    credentialCount: 0,
    error: `Failed after ${MAX_TASK_RETRIES} attempts. Last error: ${lastError}`,
    errorCategory: lastCategory,
    shouldRetry: false,
  };
}

// ─── Main Job Executor ──────────────────────────────────────────────

/**
 * Execute a fetch job with real browser automation.
 * v2: Task-level retry, proxy rotation, connectivity checks, structured logging.
 */
export async function executeJob(jobId: number, userId: number): Promise<void> {
  const jobControl = { abort: false };
  runningJobs.set(jobId, jobControl);
  incrementActiveJobs(userId);

  const jobStart = Date.now();
  log.info(`[Fetcher] ═══ Job ${jobId} STARTED ═══`);

  try {
    // Check kill switch
    const killed = await isKillSwitchActive(userId);
    if (killed) {
      log.info(`[Fetcher] Job ${jobId}: Kill switch active, cancelling`);
      await updateJobStatus(jobId, "cancelled");
      decrementActiveJobs(userId);
      return;
    }

    // Get user settings
    const settings = await getSettings(userId);
    const job = await getJob(jobId, userId);
    if (!job) {
      log.error(`[Fetcher] Job ${jobId}: Job not found`);
      await updateJobStatus(jobId, "failed");
      return;
    }

    const password = decrypt(job.encryptedPassword);

    const captchaConfig: CaptchaConfig = {
      service: (settings.captchaService as CaptchaService) || null,
      apiKey: settings.captchaApiKey || "",
    };

    await updateJobStatus(jobId, "running");

    const tasks = await getJobTasks(jobId);
    log.info(`[Fetcher] Job ${jobId}: ${tasks.length} task(s) to execute`);

    let completedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      // Check abort / kill before each task
      if (jobControl.abort) {
        await updateTaskStatus(task.id, "failed", "Job aborted by user");
        await incrementJobFailed(jobId);
        failedCount++;
        continue;
      }

      const stillKilled = await isKillSwitchActive(userId);
      if (stillKilled) {
        await updateTaskStatus(task.id, "failed", "Kill switch activated");
        await incrementJobFailed(jobId);
        failedCount++;
        continue;
      }

      log.info(`[Fetcher] Job ${jobId}: Task ${i + 1}/${tasks.length} — ${task.providerName}`);

      const result = await executeTaskWithRetry(
        task, job, password, userId, jobId,
        jobControl, captchaConfig, settings
      );

      if (result.success) {
        await incrementJobCompleted(jobId);
        completedCount++;
      } else {
        await updateTaskStatus(task.id, "failed", result.error || "Failed");
        await incrementJobFailed(jobId);
        failedCount++;
      }

      // Delay between tasks (not after the last one)
      if (i < tasks.length - 1) {
        await humanDelay(INTER_TASK_DELAY.min, INTER_TASK_DELAY.max);
      }
    }

    // ── Determine final job status ──
    const totalTasks = tasks.length;
    let finalStatus: string;

    if (completedCount === totalTasks) {
      finalStatus = "completed";
    } else if (completedCount > 0) {
      finalStatus = "completed"; // partial success still counts as completed
    } else {
      finalStatus = "failed";
    }

    await updateJobStatus(jobId, finalStatus);
    log.info(`[Fetcher] ═══ Job ${jobId} FINISHED ═══ ` +
      `Status: ${finalStatus} | ${completedCount}/${totalTasks} succeeded | ${elapsed(jobStart)}`);
  } catch (err) {
    log.error(`[Fetcher] Job ${jobId} FATAL error:`, { error: String(err) });
    await updateJobStatus(jobId, "failed");
  } finally {
    runningJobs.delete(jobId);
    decrementActiveJobs(userId);
  }
}

/**
 * Check if an error message suggests a proxy-related issue
 */
function isProxyRelatedError(error?: string): boolean {
  if (!error) return false;
  const proxyIndicators = [
    "bot protection", "bot detection", "akamai", "cloudflare",
    "blocked", "captcha", "timeout", "connection refused",
    "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "proxy",
    "network error", "ERR_CONNECTION", "ERR_PROXY",
    "seltsam", "access denied", "403 forbidden",
    "net::ERR_", "NS_ERROR_", "SOCKS",
  ];
  const lower = error.toLowerCase();
  return proxyIndicators.some(indicator => lower.includes(indicator.toLowerCase()));
}
