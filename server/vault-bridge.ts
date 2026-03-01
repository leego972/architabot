/**
 * Vault-to-ENV Bridge
 *
 * Reads the platform owner's encrypted secrets from the `userSecrets` table
 * and patches both `process.env` AND the runtime `ENV` object so that all
 * autonomous systems (advertising, SEO, affiliate, blog syndication, etc.)
 * can access API tokens stored in Titan's credential vault.
 *
 * Flow:
 *   1. Find the owner user (role = "admin" or email in ownerEmails)
 *   2. Load all their userSecrets rows
 *   3. Decrypt each one
 *   4. Map secretType → ENV property name + process.env name
 *   5. Patch both objects (only if the value is currently empty)
 *
 * This runs once on startup (after DB is ready, before schedulers start)
 * and can be re-invoked at any time via the chat tool `refresh_vault_bridge`.
 */
import { getDb } from "./db";
import { users, userSecrets } from "../drizzle/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { decrypt } from "./fetcher-db";
import { ENV } from "./_core/env";
import { createLogger } from "./_core/logger.js";

const log = createLogger("VaultBridge");

// ─── Secret Type → ENV Mapping ──────────────────────────────────────
// Maps userSecrets.secretType to { envKey: process.env name, envProp: ENV object property }
interface EnvMapping {
  envKey: string;       // process.env.DEVTO_API_KEY
  envProp: keyof typeof ENV; // ENV.devtoApiKey
}

const SECRET_TYPE_MAP: Record<string, EnvMapping> = {
  // Dev.to
  devto_api_key:              { envKey: "DEVTO_API_KEY",              envProp: "devtoApiKey" },
  // Hashnode
  hashnode_api_key:           { envKey: "HASHNODE_API_KEY",           envProp: "hashnodeApiKey" },
  hashnode_publication_id:    { envKey: "HASHNODE_PUBLICATION_ID",    envProp: "hashnodePublicationId" },
  // Medium
  medium_access_token:        { envKey: "MEDIUM_ACCESS_TOKEN",        envProp: "mediumAccessToken" },
  medium_author_id:           { envKey: "MEDIUM_AUTHOR_ID",           envProp: "mediumAuthorId" },
  // Discord
  discord_webhook_url:        { envKey: "DISCORD_WEBHOOK_URL",        envProp: "discordWebhookUrl" },
  discord_bot_token:          { envKey: "DISCORD_BOT_TOKEN",          envProp: "discordBotToken" },
  // SendGrid
  sendgrid_api_key:           { envKey: "SENDGRID_API_KEY",           envProp: "sendgridApiKey" },
  // Twitter/X
  x_api_key:                  { envKey: "X_API_KEY",                  envProp: "xApiKey" },
  x_api_key_secret:           { envKey: "X_API_KEY_SECRET",           envProp: "xApiSecret" },
  x_access_token:             { envKey: "X_ACCESS_TOKEN",             envProp: "xAccessToken" },
  x_access_token_secret:      { envKey: "X_ACCESS_TOKEN_SECRET",      envProp: "xAccessTokenSecret" },
  // Reddit
  reddit_client_id:           { envKey: "REDDIT_CLIENT_ID",           envProp: "redditClientId" },
  reddit_client_secret:       { envKey: "REDDIT_CLIENT_SECRET",       envProp: "redditClientSecret" },
  reddit_refresh_token:       { envKey: "REDDIT_REFRESH_TOKEN",       envProp: "redditRefreshToken" },
  reddit_username:            { envKey: "REDDIT_USERNAME",            envProp: "redditUsername" },
  // LinkedIn
  linkedin_access_token:      { envKey: "LINKEDIN_ACCESS_TOKEN",      envProp: "linkedinAccessToken" },
  linkedin_client_id:         { envKey: "LINKEDIN_CLIENT_ID",         envProp: "linkedinClientId" },
  linkedin_client_secret:     { envKey: "LINKEDIN_CLIENT_SECRET",     envProp: "linkedinClientSecret" },
  linkedin_ad_account_id:     { envKey: "LINKEDIN_AD_ACCOUNT_ID",     envProp: "linkedinAdAccountId" },
  linkedin_org_id:            { envKey: "LINKEDIN_ORG_ID",            envProp: "linkedinOrgId" },
  // Telegram
  telegram_bot_token:         { envKey: "TELEGRAM_BOT_TOKEN",         envProp: "telegramBotToken" },
  telegram_channel_id:        { envKey: "TELEGRAM_CHANNEL_ID",        envProp: "telegramChannelId" },
  // Mastodon
  mastodon_access_token:      { envKey: "MASTODON_ACCESS_TOKEN",      envProp: "mastodonAccessToken" },
  // TikTok
  tiktok_access_token:        { envKey: "TIKTOK_ACCESS_TOKEN",        envProp: "tiktokAccessToken" },
  tiktok_creator_token:       { envKey: "TIKTOK_CREATOR_TOKEN",       envProp: "tiktokCreatorToken" },
  tiktok_advertiser_id:       { envKey: "TIKTOK_ADVERTISER_ID",       envProp: "tiktokAdvertiserId" },
  tiktok_app_id:              { envKey: "TIKTOK_APP_ID",              envProp: "tiktokAppId" },
  tiktok_app_secret:          { envKey: "TIKTOK_APP_SECRET",          envProp: "tiktokAppSecret" },
  // Pinterest
  pinterest_access_token:     { envKey: "PINTEREST_ACCESS_TOKEN",     envProp: "pinterestAccessToken" },
  pinterest_board_id:         { envKey: "PINTEREST_BOARD_ID",         envProp: "pinterestBoardId" },
  pinterest_ad_account_id:    { envKey: "PINTEREST_AD_ACCOUNT_ID",    envProp: "pinterestAdAccountId" },
  // Meta (Facebook/Instagram)
  meta_access_token:          { envKey: "META_ACCESS_TOKEN",          envProp: "metaAccessToken" },
  meta_page_id:               { envKey: "META_PAGE_ID",               envProp: "metaPageId" },
  meta_ad_account_id:         { envKey: "META_AD_ACCOUNT_ID",         envProp: "metaAdAccountId" },
  meta_instagram_account_id:  { envKey: "META_INSTAGRAM_ACCOUNT_ID",  envProp: "metaInstagramAccountId" },
  meta_app_id:                { envKey: "META_APP_ID",                envProp: "metaAppId" },
  meta_app_secret:            { envKey: "META_APP_SECRET",            envProp: "metaAppSecret" },
  // Google Ads
  google_ads_dev_token:       { envKey: "GOOGLE_ADS_DEV_TOKEN",       envProp: "googleAdsDevToken" },
  google_ads_customer_id:     { envKey: "GOOGLE_ADS_CUSTOMER_ID",     envProp: "googleAdsCustomerId" },
  google_ads_client_id:       { envKey: "GOOGLE_ADS_CLIENT_ID",       envProp: "googleAdsClientId" },
  google_ads_client_secret:   { envKey: "GOOGLE_ADS_CLIENT_SECRET",   envProp: "googleAdsClientSecret" },
  google_ads_refresh_token:   { envKey: "GOOGLE_ADS_REFRESH_TOKEN",   envProp: "googleAdsRefreshToken" },
  // WhatsApp
  whatsapp_access_token:      { envKey: "WHATSAPP_ACCESS_TOKEN",      envProp: "whatsappAccessToken" },
  whatsapp_phone_number_id:   { envKey: "WHATSAPP_PHONE_NUMBER_ID",   envProp: "whatsappPhoneNumberId" },
  whatsapp_business_account_id: { envKey: "WHATSAPP_BUSINESS_ACCOUNT_ID", envProp: "whatsappBusinessAccountId" },
  // Snapchat
  snapchat_access_token:      { envKey: "SNAPCHAT_ACCESS_TOKEN",      envProp: "snapchatAccessToken" },
  snapchat_client_id:         { envKey: "SNAPCHAT_CLIENT_ID",         envProp: "snapchatClientId" },
  snapchat_client_secret:     { envKey: "SNAPCHAT_CLIENT_SECRET",     envProp: "snapchatClientSecret" },
  snapchat_ad_account_id:     { envKey: "SNAPCHAT_AD_ACCOUNT_ID",     envProp: "snapchatAdAccountId" },
  // YouTube
  youtube_api_key:            { envKey: "YOUTUBE_API_KEY",            envProp: "youtubeApiKey" },
  youtube_channel_id:         { envKey: "YOUTUBE_CHANNEL_ID",         envProp: "youtubeChannelId" },
  // Skool
  skool_api_key:              { envKey: "SKOOL_API_KEY",              envProp: "skoolApiKey" },
  skool_community_url:        { envKey: "SKOOL_COMMUNITY_URL",        envProp: "skoolCommunityUrl" },
  // IndieHackers
  indiehackers_username:      { envKey: "INDIEHACKERS_USERNAME",      envProp: "indieHackersUsername" },
};

// ─── Find Owner User ────────────────────────────────────────────────
/**
 * Locate the platform owner's userId.
 * Checks: role = "admin", or email in ownerEmails, or openId = ownerOpenId.
 */
async function findOwnerUserId(): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    // Strategy 1: Find by admin role
    const admins = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(5);

    if (admins.length === 1) {
      return admins[0].id;
    }

    // Strategy 2: Find by owner emails
    if (ENV.ownerEmails && ENV.ownerEmails.length > 0) {
      const byEmail = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.email, ENV.ownerEmails))
        .limit(1);
      if (byEmail.length > 0) return byEmail[0].id;
    }

    // Strategy 3: Find by ownerOpenId
    if (ENV.ownerOpenId) {
      const byOpenId = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.openId, ENV.ownerOpenId))
        .limit(1);
      if (byOpenId.length > 0) return byOpenId[0].id;
    }

    // Strategy 4: If multiple admins, return the first one
    if (admins.length > 0) {
      return admins[0].id;
    }

    return null;
  } catch (err) {
    log.warn("[VaultBridge] Failed to find owner user:", { error: String(err) });
    return null;
  }
}

// ─── Load & Patch ───────────────────────────────────────────────────

export interface VaultBridgeResult {
  ownerUserId: number | null;
  totalSecrets: number;
  patched: string[];       // secretTypes that were patched into ENV
  skipped: string[];       // secretTypes already set via Railway env vars
  failed: string[];        // secretTypes that failed to decrypt
  unmapped: string[];      // secretTypes with no ENV mapping (stored but not bridged)
}

/**
 * Load all owner secrets from the vault and patch them into ENV + process.env.
 * Safe to call multiple times — only patches empty values (won't overwrite Railway env vars).
 *
 * @param force  If true, overwrite even if ENV already has a value (use with caution)
 */
export async function loadVaultToEnv(force = false): Promise<VaultBridgeResult> {
  const result: VaultBridgeResult = {
    ownerUserId: null,
    totalSecrets: 0,
    patched: [],
    skipped: [],
    failed: [],
    unmapped: [],
  };

  const db = await getDb();
  if (!db) {
    log.warn("[VaultBridge] Database not available — skipping vault bridge");
    return result;
  }

  // 1. Find the owner
  const ownerId = await findOwnerUserId();
  if (!ownerId) {
    log.warn("[VaultBridge] No owner user found — skipping vault bridge");
    return result;
  }
  result.ownerUserId = ownerId;

  // 2. Load all secrets for this user
  let rows: Array<{ secretType: string; encryptedValue: string }>;
  try {
    rows = await db
      .select({
        secretType: userSecrets.secretType,
        encryptedValue: userSecrets.encryptedValue,
      })
      .from(userSecrets)
      .where(eq(userSecrets.userId, ownerId));
  } catch (err) {
    log.error("[VaultBridge] Failed to load secrets:", { error: String(err) });
    return result;
  }

  result.totalSecrets = rows.length;
  if (rows.length === 0) {
    log.info("[VaultBridge] Owner has no secrets in vault — nothing to bridge");
    return result;
  }

  // 3. Decrypt and patch each secret
  for (const row of rows) {
    const mapping = SECRET_TYPE_MAP[row.secretType];
    if (!mapping) {
      result.unmapped.push(row.secretType);
      continue;
    }

    // Decrypt
    let decrypted: string;
    try {
      decrypted = decrypt(row.encryptedValue);
    } catch {
      result.failed.push(row.secretType);
      continue;
    }

    if (!decrypted || decrypted.trim() === "") {
      result.failed.push(row.secretType);
      continue;
    }

    // Check if already set (Railway env var takes precedence unless force=true)
    const currentEnvValue = (ENV as any)[mapping.envProp];
    if (!force && currentEnvValue && currentEnvValue.trim() !== "") {
      result.skipped.push(row.secretType);
      continue;
    }

    // Patch both process.env and the ENV object
    process.env[mapping.envKey] = decrypted;
    (ENV as any)[mapping.envProp] = decrypted;
    result.patched.push(row.secretType);
  }

  // 4. Log results
  if (result.patched.length > 0) {
    log.info(`[VaultBridge] Patched ${result.patched.length} secrets into ENV: ${result.patched.join(", ")}`);
  }
  if (result.skipped.length > 0) {
    log.info(`[VaultBridge] Skipped ${result.skipped.length} (already set via env vars): ${result.skipped.join(", ")}`);
  }
  if (result.failed.length > 0) {
    log.warn(`[VaultBridge] Failed to decrypt ${result.failed.length}: ${result.failed.join(", ")}`);
  }
  if (result.unmapped.length > 0) {
    log.info(`[VaultBridge] ${result.unmapped.length} secrets have no ENV mapping: ${result.unmapped.join(", ")}`);
  }

  return result;
}

// ─── Quick Status Check ─────────────────────────────────────────────

export interface VaultBridgeStatus {
  lastRun: Date | null;
  ownerUserId: number | null;
  totalMappings: number;
  activeSecrets: number;
  channelsUnlocked: string[];
  channelsStillMissing: string[];
}

let _lastResult: VaultBridgeResult | null = null;
let _lastRunTime: Date | null = null;

/**
 * Run the vault bridge and cache the result for status queries.
 */
export async function runVaultBridge(force = false): Promise<VaultBridgeResult> {
  const result = await loadVaultToEnv(force);
  _lastResult = result;
  _lastRunTime = new Date();
  return result;
}

/**
 * Get the current vault bridge status without re-running it.
 */
export function getVaultBridgeStatus(): VaultBridgeStatus {
  // Check which channels are now configured
  const channelChecks: Array<{ name: string; check: () => boolean }> = [
    { name: "Dev.to",     check: () => !!ENV.devtoApiKey },
    { name: "Hashnode",   check: () => !!(ENV.hashnodeApiKey && ENV.hashnodePublicationId) },
    { name: "Medium",     check: () => !!(ENV.mediumAccessToken && ENV.mediumAuthorId) },
    { name: "Discord",    check: () => !!ENV.discordWebhookUrl },
    { name: "SendGrid",   check: () => !!ENV.sendgridApiKey },
    { name: "Twitter/X",  check: () => !!(ENV.xApiKey && ENV.xApiSecret && ENV.xAccessToken && ENV.xAccessTokenSecret) },
    { name: "Reddit",     check: () => !!(ENV.redditClientId && ENV.redditClientSecret && ENV.redditRefreshToken) },
    { name: "LinkedIn",   check: () => !!ENV.linkedinAccessToken },
    { name: "Telegram",   check: () => !!(ENV.telegramBotToken && ENV.telegramChannelId) },
    { name: "Mastodon",   check: () => !!ENV.mastodonAccessToken },
    { name: "TikTok",     check: () => !!(ENV.tiktokAccessToken || ENV.tiktokCreatorToken) },
    { name: "Pinterest",  check: () => !!(ENV.pinterestAccessToken && ENV.pinterestBoardId) },
    { name: "Meta",       check: () => !!(ENV.metaAccessToken && ENV.metaPageId) },
    { name: "Google Ads", check: () => !!(ENV.googleAdsDevToken && ENV.googleAdsCustomerId) },
    { name: "WhatsApp",   check: () => !!(ENV.whatsappAccessToken && ENV.whatsappPhoneNumberId) },
    { name: "YouTube",    check: () => !!ENV.youtubeApiKey },
  ];

  const unlocked = channelChecks.filter(c => c.check()).map(c => c.name);
  const missing = channelChecks.filter(c => !c.check()).map(c => c.name);

  return {
    lastRun: _lastRunTime,
    ownerUserId: _lastResult?.ownerUserId ?? null,
    totalMappings: Object.keys(SECRET_TYPE_MAP).length,
    activeSecrets: _lastResult?.patched.length ?? 0,
    channelsUnlocked: unlocked,
    channelsStillMissing: missing,
  };
}

/**
 * Get the secret type map (for chat tools to show what types are supported).
 */
export function getSupportedSecretTypes(): string[] {
  return Object.keys(SECRET_TYPE_MAP);
}

/**
 * Get the ENV property name for a given secretType.
 */
export function getEnvMapping(secretType: string): EnvMapping | null {
  return SECRET_TYPE_MAP[secretType] ?? null;
}

// ─── Auto-Seed Known Tokens ─────────────────────────────────────────

/**
 * Seed known API tokens into the owner's vault if they're not already there.
 * This is called during startup to ensure tokens provided during setup
 * are persisted in the encrypted vault for the bridge to pick up.
 *
 * Only seeds tokens that:
 * 1. Are hardcoded here (known good tokens from setup)
 * 2. Don't already exist in the vault for this user
 * 3. Have a valid secretType mapping
 */
export async function seedKnownTokens(): Promise<{ seeded: string[]; skipped: string[] }> {
  const result = { seeded: [] as string[], skipped: [] as string[] };

  const db = await getDb();
  if (!db) return result;

  const ownerId = await findOwnerUserId();
  if (!ownerId) return result;

  // Known tokens to seed (from platform setup)
  const knownTokens: Array<{ secretType: string; value: string; label: string }> = [
    {
      secretType: "devto_api_key",
      value: "7njZzcv377bqHvwt4PWmEmxN",
      label: "Dev.to API Key (auto-seeded)",
    },
  ];

  for (const token of knownTokens) {
    try {
      // Check if already exists
      const existing = await db
        .select({ id: userSecrets.id })
        .from(userSecrets)
        .where(
          and(
            eq(userSecrets.userId, ownerId),
            eq(userSecrets.secretType, token.secretType)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        result.skipped.push(token.secretType);
        continue;
      }

      // Encrypt and insert
      const { encrypt } = await import("./fetcher-db");
      const encryptedValue = encrypt(token.value);

      await db.insert(userSecrets).values({
        userId: ownerId,
        secretType: token.secretType,
        encryptedValue,
        label: token.label,
      });

      result.seeded.push(token.secretType);
      log.info(`[VaultBridge] Auto-seeded ${token.secretType} for owner (userId=${ownerId})`);
    } catch (err) {
      log.warn(`[VaultBridge] Failed to seed ${token.secretType}:`, { error: String(err) });
    }
  }

  return result;
}
