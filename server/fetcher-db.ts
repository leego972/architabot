import { eq, and, desc } from "drizzle-orm";
import { getDb } from "./db";
import {
  fetcherJobs,
  fetcherTasks,
  fetcherCredentials,
  fetcherSettings,
  fetcherKillSwitch,
} from "../drizzle/schema";
import crypto from "crypto";

// ─── Encryption helpers (AES-256-GCM) ──────────────────────────────
const ENCRYPTION_KEY = process.env.JWT_SECRET
  ? crypto.scryptSync(process.env.JWT_SECRET, "fetcher-vault-salt", 32)
  : crypto.randomBytes(32);

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, tagHex, encrypted] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ─── Kill Switch ────────────────────────────────────────────────────
function generateKillCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function getOrCreateKillSwitch(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(fetcherKillSwitch).where(eq(fetcherKillSwitch.userId, userId)).limit(1);
  if (existing.length > 0) return existing[0];

  const code = generateKillCode();
  await db.insert(fetcherKillSwitch).values({ userId, code, active: 0 });
  const result = await db.select().from(fetcherKillSwitch).where(eq(fetcherKillSwitch.userId, userId)).limit(1);
  return result[0];
}

export async function isKillSwitchActive(userId: number): Promise<boolean> {
  const ks = await getOrCreateKillSwitch(userId);
  return ks.active === 1;
}

export async function activateKillSwitch(userId: number, code: string): Promise<boolean> {
  const ks = await getOrCreateKillSwitch(userId);
  if (ks.code !== code) return false;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(fetcherKillSwitch).set({ active: 1 }).where(eq(fetcherKillSwitch.userId, userId));
  return true;
}

export async function deactivateKillSwitch(userId: number, code: string): Promise<boolean> {
  const ks = await getOrCreateKillSwitch(userId);
  if (ks.code !== code) return false;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(fetcherKillSwitch).set({ active: 0 }).where(eq(fetcherKillSwitch.userId, userId));
  return true;
}

export async function resetKillSwitch(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const newCode = generateKillCode();
  await db.update(fetcherKillSwitch).set({ code: newCode, active: 0 }).where(eq(fetcherKillSwitch.userId, userId));
  return newCode;
}

// ─── Settings ───────────────────────────────────────────────────────
export async function getSettings(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(fetcherSettings).where(eq(fetcherSettings.userId, userId)).limit(1);
  if (result.length === 0) {
    await db.insert(fetcherSettings).values({ userId, headless: 1 });
    const created = await db.select().from(fetcherSettings).where(eq(fetcherSettings.userId, userId)).limit(1);
    return created[0];
  }
  return result[0];
}

export async function updateSettings(userId: number, data: {
  proxyServer?: string | null;
  proxyUsername?: string | null;
  proxyPassword?: string | null;
  captchaService?: string | null;
  captchaApiKey?: string | null;
  headless?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await getSettings(userId); // ensure row exists
  await db.update(fetcherSettings).set(data).where(eq(fetcherSettings.userId, userId));
  return getSettings(userId);
}

// ─── Jobs ───────────────────────────────────────────────────────────
export async function createJob(userId: number, email: string, password: string, providers: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const encryptedPassword = encrypt(password);
  await db.insert(fetcherJobs).values({
    userId,
    email,
    encryptedPassword,
    selectedProviders: providers,
    totalProviders: providers.length,
    status: "queued",
  });

  // Get the last inserted job
  const jobs = await db.select().from(fetcherJobs)
    .where(eq(fetcherJobs.userId, userId))
    .orderBy(desc(fetcherJobs.id))
    .limit(1);
  const job = jobs[0];

  // Create tasks for each provider
  const { PROVIDERS } = await import("../shared/fetcher");
  for (const providerId of providers) {
    const provider = PROVIDERS[providerId];
    if (provider) {
      await db.insert(fetcherTasks).values({
        jobId: job.id,
        providerId,
        providerName: provider.name,
        status: "queued",
      });
    }
  }

  return job;
}

export async function getJobs(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(fetcherJobs)
    .where(eq(fetcherJobs.userId, userId))
    .orderBy(desc(fetcherJobs.id));
}

export async function getJob(jobId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(fetcherJobs)
    .where(and(eq(fetcherJobs.id, jobId), eq(fetcherJobs.userId, userId)))
    .limit(1);
  return result[0] ?? null;
}

export async function getJobTasks(jobId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(fetcherTasks)
    .where(eq(fetcherTasks.jobId, jobId))
    .orderBy(fetcherTasks.id);
}

export async function updateJobStatus(jobId: number, status: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = { status };
  if (status === "completed" || status === "failed") {
    updateData.completedAt = new Date();
  }
  await db.update(fetcherJobs).set(updateData).where(eq(fetcherJobs.id, jobId));
}

export async function updateTaskStatus(taskId: number, status: string, message?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = { status, statusMessage: message ?? null };
  if (status === "completed" || status === "failed") {
    updateData.completedAt = new Date();
  }
  if (status === "failed") {
    updateData.errorMessage = message ?? null;
  }
  await db.update(fetcherTasks).set(updateData).where(eq(fetcherTasks.id, taskId));
}

export async function incrementJobCompleted(jobId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const job = await db.select().from(fetcherJobs).where(eq(fetcherJobs.id, jobId)).limit(1);
  if (job[0]) {
    await db.update(fetcherJobs).set({ completedProviders: job[0].completedProviders + 1 }).where(eq(fetcherJobs.id, jobId));
  }
}

export async function incrementJobFailed(jobId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const job = await db.select().from(fetcherJobs).where(eq(fetcherJobs.id, jobId)).limit(1);
  if (job[0]) {
    await db.update(fetcherJobs).set({ failedProviders: job[0].failedProviders + 1 }).where(eq(fetcherJobs.id, jobId));
  }
}

export async function cancelJob(jobId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(fetcherJobs).set({ status: "cancelled", completedAt: new Date() })
    .where(and(eq(fetcherJobs.id, jobId), eq(fetcherJobs.userId, userId)));
  // Cancel all pending tasks
  const tasks = await getJobTasks(jobId);
  for (const task of tasks) {
    if (task.status === "queued") {
      await updateTaskStatus(task.id, "failed", "Job cancelled");
    }
  }
}

// ─── Credentials ────────────────────────────────────────────────────
export async function storeCredential(userId: number, jobId: number, taskId: number, providerId: string, providerName: string, keyType: string, value: string, keyLabel?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const encryptedValue = encrypt(value);
  await db.insert(fetcherCredentials).values({
    userId, jobId, taskId, providerId, providerName, keyType, keyLabel: keyLabel ?? null, encryptedValue,
  });
}

export async function storeManualCredential(
  userId: number,
  providerId: string,
  providerName: string,
  keyType: string,
  value: string,
  keyLabel?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const encryptedValue = encrypt(value);
  // jobId=0 and taskId=0 indicate a manually-added credential
  await db.insert(fetcherCredentials).values({
    userId,
    jobId: 0,
    taskId: 0,
    providerId,
    providerName,
    keyType,
    keyLabel: keyLabel ?? null,
    encryptedValue,
  });
}

export async function getCredentials(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(fetcherCredentials)
    .where(eq(fetcherCredentials.userId, userId))
    .orderBy(desc(fetcherCredentials.id));
}

export async function deleteCredential(credId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(fetcherCredentials)
    .where(and(eq(fetcherCredentials.id, credId), eq(fetcherCredentials.userId, userId)));
}

export async function getDecryptedCredentials(userId: number) {
  const creds = await getCredentials(userId);
  return creds.map(c => ({
    ...c,
    value: decrypt(c.encryptedValue),
    encryptedValue: undefined,
  }));
}

export async function exportCredentials(userId: number, format: "json" | "env" | "csv") {
  const creds = await getDecryptedCredentials(userId);
  if (format === "env") {
    return creds.map(c => `${c.providerId.toUpperCase()}_${c.keyType.toUpperCase()}=${c.value}`).join("\n");
  }
  if (format === "csv") {
    const header = "Provider,Provider ID,Key Type,Label,Value";
    const rows = creds.map(c => {
      const escapeCsv = (val: string) => {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };
      return [
        escapeCsv(c.providerName),
        escapeCsv(c.providerId),
        escapeCsv(c.keyType),
        escapeCsv(c.keyLabel || ""),
        escapeCsv(c.value),
      ].join(",");
    });
    return [header, ...rows].join("\n");
  }
  return JSON.stringify(creds.map(c => ({
    provider: c.providerName,
    providerId: c.providerId,
    keyType: c.keyType,
    label: c.keyLabel,
    value: c.value,
  })), null, 2);
}
