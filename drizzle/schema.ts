import { boolean, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: text("passwordHash"), // null for OAuth users, bcrypt hash for email users
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  emailVerificationToken: varchar("emailVerificationToken", { length: 128 }),
  emailVerificationExpires: timestamp("emailVerificationExpires"),
  twoFactorSecret: text("twoFactorSecret"), // encrypted TOTP secret
  twoFactorEnabled: boolean("twoFactorEnabled").default(false).notNull(),
  twoFactorBackupCodes: json("twoFactorBackupCodes").$type<string[]>(), // hashed backup codes
  onboardingCompleted: boolean("onboardingCompleted").default(false).notNull(),
  marketingConsent: boolean("marketingConsent").default(true).notNull(), // opted-in for promotional emails
  loginCount: int("loginCount").default(0).notNull(), // track total logins for engagement
  // ── Trial & Payment Method ──
  trialStartedAt: timestamp("trialStartedAt"), // when 7-day trial began
  trialEndsAt: timestamp("trialEndsAt"), // when trial expires (trialStartedAt + 7 days)
  hasPaymentMethod: boolean("hasPaymentMethod").default(false).notNull(), // Stripe payment method on file
  stripeCustomerId: varchar("stripeCustomerId", { length: 128 }), // Stripe customer ID for this user
  trialConvertedAt: timestamp("trialConvertedAt"), // when trial auto-converted to paid
  // ── Referral Titan Unlock ──
  titanUnlockExpiry: timestamp("titanUnlockExpiry"), // if set and in the future, user gets Titan features
  titanUnlockGrantedBy: int("titanUnlockGrantedBy"), // userId of the referred user who triggered the unlock
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Password Reset Tokens ─────────────────────────────────────────

export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// ─── Identity Providers (Multi-Provider Auth) ─────────────────────

export const identityProviders = mysqlTable("identity_providers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  provider: varchar("provider", { length: 64 }).notNull(), // "email", "manus", "google", "github"
  providerAccountId: varchar("providerAccountId", { length: 256 }).notNull(), // email address or OAuth openId
  email: varchar("email", { length: 320 }),
  displayName: varchar("displayName", { length: 256 }),
  avatarUrl: text("avatarUrl"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  linkedAt: timestamp("linkedAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IdentityProvider = typeof identityProviders.$inferSelect;
export type InsertIdentityProvider = typeof identityProviders.$inferInsert;

// ─── Fetcher Tables ─────────────────────────────────────────────────

export const fetcherJobs = mysqlTable("fetcher_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  encryptedPassword: text("encryptedPassword").notNull(),
  selectedProviders: json("selectedProviders").$type<string[]>().notNull(),
  status: mysqlEnum("status", ["queued", "running", "completed", "failed", "cancelled"]).default("queued").notNull(),
  totalProviders: int("totalProviders").default(0).notNull(),
  completedProviders: int("completedProviders").default(0).notNull(),
  failedProviders: int("failedProviders").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type FetcherJob = typeof fetcherJobs.$inferSelect;

export const fetcherTasks = mysqlTable("fetcher_tasks", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  providerId: varchar("providerId", { length: 64 }).notNull(),
  providerName: varchar("providerName", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["queued", "logging_in", "navigating", "extracting", "captcha_wait", "completed", "failed"]).default("queued").notNull(),
  statusMessage: text("statusMessage"),
  errorMessage: text("errorMessage"),
  captchaType: varchar("captchaType", { length: 64 }),
  needsUserCaptcha: int("needsUserCaptcha").default(0).notNull(),
  userCaptchaDone: int("userCaptchaDone").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type FetcherTask = typeof fetcherTasks.$inferSelect;

export const fetcherCredentials = mysqlTable("fetcher_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  jobId: int("jobId").notNull(),
  taskId: int("taskId").notNull(),
  providerId: varchar("providerId", { length: 64 }).notNull(),
  providerName: varchar("providerName", { length: 128 }).notNull(),
  keyType: varchar("keyType", { length: 64 }).notNull(),
  keyLabel: varchar("keyLabel", { length: 256 }),
  encryptedValue: text("encryptedValue").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FetcherCredential = typeof fetcherCredentials.$inferSelect;

export const fetcherSettings = mysqlTable("fetcher_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  proxyServer: varchar("proxyServer", { length: 512 }),
  proxyUsername: varchar("proxyUsername", { length: 128 }),
  proxyPassword: text("proxyPassword"),
  captchaService: varchar("captchaService", { length: 64 }),
  captchaApiKey: text("captchaApiKey"),
  headless: int("headless").default(1).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FetcherSettings = typeof fetcherSettings.$inferSelect;

export const fetcherKillSwitch = mysqlTable("fetcher_killswitch", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  code: varchar("code", { length: 16 }).notNull(),
  active: int("active").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FetcherKillSwitch = typeof fetcherKillSwitch.$inferSelect;

// ─── Proxy Pool ─────────────────────────────────────────────────────

export const fetcherProxies = mysqlTable("fetcher_proxies", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  label: varchar("label", { length: 128 }).notNull(),
  protocol: mysqlEnum("protocol", ["http", "https", "socks5"]).default("http").notNull(),
  host: varchar("host", { length: 256 }).notNull(),
  port: int("port").notNull(),
  username: varchar("username", { length: 128 }),
  password: text("password"),
  proxyType: mysqlEnum("proxyType", ["residential", "datacenter", "mobile", "isp"]).default("residential").notNull(),
  country: varchar("country", { length: 8 }),
  city: varchar("city", { length: 128 }),
  // Health tracking
  healthy: int("healthy").default(1).notNull(),
  latencyMs: int("latencyMs"),
  lastCheckedAt: timestamp("lastCheckedAt"),
  lastUsedAt: timestamp("lastUsedAt"),
  failCount: int("failCount").default(0).notNull(),
  successCount: int("successCount").default(0).notNull(),
  // Metadata
  provider: varchar("provider", { length: 128 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FetcherProxy = typeof fetcherProxies.$inferSelect;
export type InsertFetcherProxy = typeof fetcherProxies.$inferInsert;

// ─── Releases / Downloads ──────────────────────────────────────────

export const releases = mysqlTable("releases", {
  id: int("id").autoincrement().primaryKey(),
  version: varchar("version", { length: 32 }).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  changelog: text("changelog").notNull(),
  downloadUrlWindows: text("downloadUrlWindows"),
  downloadUrlMac: text("downloadUrlMac"),
  downloadUrlLinux: text("downloadUrlLinux"),
  sha512Windows: text("sha512Windows"),
  sha512Mac: text("sha512Mac"),
  sha512Linux: text("sha512Linux"),
  fileSizeWindows: int("fileSizeWindows"),
  fileSizeMac: int("fileSizeMac"),
  fileSizeLinux: int("fileSizeLinux"),
  fileSizeMb: int("fileSizeMb"),
  isLatest: int("isLatest").default(0).notNull(),
  isPrerelease: int("isPrerelease").default(0).notNull(),
  downloadCount: int("downloadCount").default(0).notNull(),
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Release = typeof releases.$inferSelect;
export type InsertRelease = typeof releases.$inferInsert;

// ─── Contact / Billing Submissions ─────────────────────────────────
export const contactSubmissions = mysqlTable("contact_submissions", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  category: mysqlEnum("category", ["billing", "technical", "account", "general"]).default("general").notNull(),
  subject: varchar("subject", { length: 512 }).notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["new", "in_progress", "resolved", "closed"]).default("new").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ContactSubmission = typeof contactSubmissions.$inferSelect;
export type InsertContactSubmission = typeof contactSubmissions.$inferInsert;

// ─── Subscriptions (Stripe) ───────────────────────────────────────
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 128 }).notNull(),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 128 }),
  plan: mysqlEnum("plan", ["free", "pro", "enterprise", "cyber", "cyber_plus", "titan"]).default("free").notNull(),
  status: mysqlEnum("status", ["active", "canceled", "past_due", "incomplete", "trialing"]).default("active").notNull(),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// ─── Download Gate ────────────────────────────────────────────────

export const downloadTokens = mysqlTable("download_tokens", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  userId: int("userId").notNull(),
  releaseId: int("releaseId").notNull(),
  platform: mysqlEnum("platform", ["windows", "mac", "linux"]).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DownloadToken = typeof downloadTokens.$inferSelect;
export type InsertDownloadToken = typeof downloadTokens.$inferInsert;

export const downloadAuditLog = mysqlTable("download_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  userEmail: varchar("userEmail", { length: 320 }),
  userName: varchar("userName", { length: 256 }),
  releaseId: int("releaseId").notNull(),
  releaseVersion: varchar("releaseVersion", { length: 32 }).notNull(),
  platform: mysqlEnum("platform", ["windows", "mac", "linux"]).notNull(),
  tokenId: int("tokenId"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: text("userAgent"),
  status: mysqlEnum("status", ["initiated", "completed", "expired", "revoked", "rate_limited"]).default("initiated").notNull(),
  downloadedAt: timestamp("downloadedAt").defaultNow().notNull(),
});

export type DownloadAuditLog = typeof downloadAuditLog.$inferSelect;
export type InsertDownloadAuditLog = typeof downloadAuditLog.$inferInsert;

// ─── API Keys ────────────────────────────────────────────────────────

export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  keyPrefix: varchar("keyPrefix", { length: 16 }).notNull(), // first 8 chars for display
  keyHash: varchar("keyHash", { length: 128 }).notNull(), // SHA-256 hash for lookup
  scopes: json("scopes").$type<string[]>().notNull(), // ["credentials:read", "credentials:export", etc.]
  lastUsedAt: timestamp("lastUsedAt"),
  usageCount: int("usageCount").default(0).notNull(),
  expiresAt: timestamp("expiresAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

// ─── Team Members ────────────────────────────────────────────────────

export const teamMembers = mysqlTable("team_members", {
  id: int("id").autoincrement().primaryKey(),
  teamOwnerId: int("teamOwnerId").notNull(), // the user who owns the team
  userId: int("userId").notNull(), // the member user
  role: mysqlEnum("role", ["owner", "admin", "member", "viewer"]).default("member").notNull(),
  invitedByUserId: int("invitedByUserId"),
  inviteEmail: varchar("inviteEmail", { length: 320 }),
  inviteToken: varchar("inviteToken", { length: 64 }),
  inviteStatus: mysqlEnum("inviteStatus", ["pending", "accepted", "declined", "expired"]).default("accepted").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

// ─── Audit Logs ──────────────────────────────────────────────────────

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 256 }),
  userEmail: varchar("userEmail", { length: 320 }),
  action: varchar("action", { length: 128 }).notNull(), // e.g. "credential.export", "job.create", "team.invite"
  resource: varchar("resource", { length: 128 }), // e.g. "credential", "job", "proxy", "apiKey"
  resourceId: varchar("resourceId", { length: 64 }), // ID of the affected resource
  details: json("details").$type<Record<string, unknown>>(), // extra context
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ─── Dashboard Layout Preferences ──────────────────────────────────

export const dashboardLayouts = mysqlTable("dashboard_layouts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(), // one layout per user
  widgetOrder: json("widgetOrder").$type<string[]>().notNull(), // ordered list of widget IDs
  hiddenWidgets: json("hiddenWidgets").$type<string[]>(), // widgets the user has hidden
  widgetSizes: json("widgetSizes").$type<Record<string, "sm" | "md" | "lg">>(), // optional size overrides
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DashboardLayout = typeof dashboardLayouts.$inferSelect;
export type InsertDashboardLayout = typeof dashboardLayouts.$inferInsert;

// ─── V2.0: Credential Expiry Watchdog ─────────────────────────────

export const credentialWatches = mysqlTable("credential_watches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  credentialId: int("credentialId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  alertDaysBefore: int("alertDaysBefore").default(7).notNull(),
  status: mysqlEnum("status", ["active", "expiring_soon", "expired", "dismissed"]).default("active").notNull(),
  lastNotifiedAt: timestamp("lastNotifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CredentialWatch = typeof credentialWatches.$inferSelect;
export type InsertCredentialWatch = typeof credentialWatches.$inferInsert;

// ─── V2.0: Credential Diff & History ──────────────────────────────

export const credentialHistory = mysqlTable("credential_history", {
  id: int("id").autoincrement().primaryKey(),
  credentialId: int("credentialId").notNull(),
  userId: int("userId").notNull(),
  providerId: varchar("providerId", { length: 64 }).notNull(),
  keyType: varchar("keyType", { length: 64 }).notNull(),
  encryptedValue: text("encryptedValue").notNull(),
  changeType: mysqlEnum("changeType", ["created", "rotated", "manual_update", "rollback"]).default("created").notNull(),
  snapshotNote: varchar("snapshotNote", { length: 512 }),
  jobId: int("jobId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CredentialHistoryEntry = typeof credentialHistory.$inferSelect;
export type InsertCredentialHistoryEntry = typeof credentialHistory.$inferInsert;

// ─── V2.0: Bulk Provider Sync ─────────────────────────────────────

export const bulkSyncJobs = mysqlTable("bulk_sync_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  totalProviders: int("totalProviders").default(0).notNull(),
  completedProviders: int("completedProviders").default(0).notNull(),
  failedProviders: int("failedProviders").default(0).notNull(),
  status: mysqlEnum("status", ["queued", "running", "completed", "failed", "cancelled"]).default("queued").notNull(),
  triggeredBy: mysqlEnum("triggeredBy", ["manual", "scheduled"]).default("manual").notNull(),
  linkedJobIds: json("linkedJobIds").$type<number[]>(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BulkSyncJob = typeof bulkSyncJobs.$inferSelect;
export type InsertBulkSyncJob = typeof bulkSyncJobs.$inferInsert;

// ─── V3.0: Scheduled Auto-Sync ──────────────────────────────────

export const syncSchedules = mysqlTable("sync_schedules", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  frequency: mysqlEnum("frequency", ["daily", "weekly", "biweekly", "monthly"]).default("weekly").notNull(),
  dayOfWeek: int("dayOfWeek"), // 0=Sunday, 6=Saturday (for weekly/biweekly)
  timeOfDay: varchar("timeOfDay", { length: 5 }).notNull(), // HH:mm in 24h format
  timezone: varchar("timezone", { length: 64 }).default("UTC").notNull(),
  providerIds: json("providerIds").$type<string[]>().notNull(), // which providers to sync
  enabled: int("enabled").default(1).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  lastRunStatus: mysqlEnum("lastRunStatus", ["success", "partial", "failed"]),
  lastRunJobId: int("lastRunJobId"),
  totalRuns: int("totalRuns").default(0).notNull(),
  successfulRuns: int("successfulRuns").default(0).notNull(),
  failedRuns: int("failedRuns").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SyncSchedule = typeof syncSchedules.$inferSelect;
export type InsertSyncSchedule = typeof syncSchedules.$inferInsert;

// ─── V3.0: Provider Health Snapshots (for trends) ───────────────

export const providerHealthSnapshots = mysqlTable("provider_health_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  providerId: varchar("providerId", { length: 64 }).notNull(),
  totalFetches: int("totalFetches").default(0).notNull(),
  successfulFetches: int("successfulFetches").default(0).notNull(),
  failedFetches: int("failedFetches").default(0).notNull(),
  avgDurationMs: int("avgDurationMs"),
  circuitState: varchar("circuitState", { length: 16 }),
  snapshotDate: timestamp("snapshotDate").notNull(), // one snapshot per day per provider
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProviderHealthSnapshot = typeof providerHealthSnapshots.$inferSelect;
export type InsertProviderHealthSnapshot = typeof providerHealthSnapshots.$inferInsert;

// ─── V3.0: Smart Fetch Recommendations ──────────────────────────

export const fetchRecommendations = mysqlTable("fetch_recommendations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  providerId: varchar("providerId", { length: 64 }).notNull(),
  recommendationType: mysqlEnum("recommendationType", [
    "stale_credential",     // credential hasn't been refreshed in a long time
    "rotation_detected",    // upstream rotation likely happened
    "high_failure_rate",    // provider has high failure rate, suggest retry
    "optimal_time",         // best time to fetch based on historical success
    "new_provider",         // suggest a new provider the user hasn't tried
    "proxy_needed",         // provider needs proxy but user doesn't have one
  ]).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  actionUrl: varchar("actionUrl", { length: 256 }), // deep link to take action
  dismissed: int("dismissed").default(0).notNull(),
  expiresAt: timestamp("expiresAt"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FetchRecommendation = typeof fetchRecommendations.$inferSelect;
export type InsertFetchRecommendation = typeof fetchRecommendations.$inferInsert;

// ─── V4.0: Credential Leak Scanner ─────────────────────────────

export const leakScans = mysqlTable("leak_scans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["queued", "scanning", "completed", "failed"]).default("queued").notNull(),
  sourcesScanned: int("sourcesScanned").default(0).notNull(),
  leaksFound: int("leaksFound").default(0).notNull(),
  scanType: mysqlEnum("scanType", ["full", "quick", "targeted"]).default("full").notNull(),
  targetPatterns: json("targetPatterns").$type<string[]>(), // specific patterns to scan for
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeakScan = typeof leakScans.$inferSelect;
export type InsertLeakScan = typeof leakScans.$inferInsert;

export const leakFindings = mysqlTable("leak_findings", {
  id: int("id").autoincrement().primaryKey(),
  scanId: int("scanId").notNull(),
  userId: int("userId").notNull(),
  source: mysqlEnum("source", ["github", "gitlab", "pastebin", "stackoverflow", "npm", "docker_hub", "other"]).notNull(),
  sourceUrl: text("sourceUrl"), // URL where the leak was found
  matchedPattern: varchar("matchedPattern", { length: 256 }).notNull(), // e.g. "sk-..." or "AKIA..."
  credentialType: varchar("credentialType", { length: 64 }).notNull(), // e.g. "openai_api_key", "aws_access_key"
  severity: mysqlEnum("severity", ["critical", "high", "medium", "low"]).default("high").notNull(),
  snippet: text("snippet"), // redacted context around the match
  repoOrFile: varchar("repoOrFile", { length: 512 }), // repo name or file path
  author: varchar("author", { length: 256 }), // commit author or poster
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  status: mysqlEnum("status", ["new", "reviewing", "confirmed", "false_positive", "resolved"]).default("new").notNull(),
  resolvedAt: timestamp("resolvedAt"),
  resolvedNote: text("resolvedNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeakFinding = typeof leakFindings.$inferSelect;
export type InsertLeakFinding = typeof leakFindings.$inferInsert;

// ─── V4.0: One-Click Provider Onboarding ────────────────────────

export const providerOnboarding = mysqlTable("provider_onboarding", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  providerUrl: text("providerUrl").notNull(), // URL the user pasted
  detectedName: varchar("detectedName", { length: 256 }), // AI-detected provider name
  detectedLoginUrl: text("detectedLoginUrl"), // AI-detected login page
  detectedKeysUrl: text("detectedKeysUrl"), // AI-detected API keys page
  detectedKeyTypes: json("detectedKeyTypes").$type<string[]>(), // AI-detected key types
  generatedScript: text("generatedScript"), // AI-generated automation script
  status: mysqlEnum("status", ["analyzing", "ready", "testing", "verified", "failed"]).default("analyzing").notNull(),
  confidence: int("confidence").default(0).notNull(), // 0-100 confidence score
  errorMessage: text("errorMessage"),
  testResult: json("testResult").$type<{ success: boolean; steps: string[]; errors: string[] }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProviderOnboarding = typeof providerOnboarding.$inferSelect;
export type InsertProviderOnboarding = typeof providerOnboarding.$inferInsert;

// ─── V4.0: Team Credential Vault ────────────────────────────────

export const vaultItems = mysqlTable("vault_items", {
  id: int("id").autoincrement().primaryKey(),
  teamOwnerId: int("teamOwnerId").notNull(), // the team owner
  createdByUserId: int("createdByUserId").notNull(), // who added it
  name: varchar("name", { length: 256 }).notNull(), // human-readable label
  providerId: varchar("providerId", { length: 64 }), // optional link to a known provider
  credentialType: varchar("credentialType", { length: 64 }).notNull(), // api_key, token, secret, etc.
  encryptedValue: text("encryptedValue").notNull(), // AES-256 encrypted
  accessLevel: mysqlEnum("accessLevel", ["owner", "admin", "member", "viewer"]).default("member").notNull(),
  expiresAt: timestamp("expiresAt"),
  lastAccessedAt: timestamp("lastAccessedAt"),
  accessCount: int("accessCount").default(0).notNull(),
  tags: json("tags").$type<string[]>(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VaultItem = typeof vaultItems.$inferSelect;
export type InsertVaultItem = typeof vaultItems.$inferInsert;

export const vaultAccessLog = mysqlTable("vault_access_log", {
  id: int("id").autoincrement().primaryKey(),
  vaultItemId: int("vaultItemId").notNull(),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 256 }),
  action: mysqlEnum("action", ["view", "copy", "reveal", "update", "delete", "share"]).notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VaultAccessLogEntry = typeof vaultAccessLog.$inferSelect;
export type InsertVaultAccessLogEntry = typeof vaultAccessLog.$inferInsert;

// ─── V5.0: Webhooks ────────────────────────────────────────────

export const webhooks = mysqlTable("webhooks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  url: text("url").notNull(), // delivery URL
  secret: varchar("secret", { length: 128 }).notNull(), // HMAC signing secret
  events: json("events").$type<string[]>().notNull(), // e.g. ["scan.completed", "credential.rotated"]
  active: int("active").default(1).notNull(),
  lastDeliveredAt: timestamp("lastDeliveredAt"),
  lastStatusCode: int("lastStatusCode"),
  failCount: int("failCount").default(0).notNull(),
  successCount: int("successCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = typeof webhooks.$inferInsert;

export const webhookDeliveryLogs = mysqlTable("webhook_delivery_logs", {
  id: int("id").autoincrement().primaryKey(),
  webhookId: int("webhookId").notNull(),
  userId: int("userId").notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  payload: json("payload").$type<Record<string, unknown>>(),
  statusCode: int("statusCode"),
  responseMs: int("responseMs"),
  success: int("success").default(0).notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WebhookDeliveryLog = typeof webhookDeliveryLogs.$inferSelect;
export type InsertWebhookDeliveryLog = typeof webhookDeliveryLogs.$inferInsert;

// ─── V5.0: API Usage Logs ──────────────────────────────────────

export const apiUsageLogs = mysqlTable("api_usage_logs", {
  id: int("id").autoincrement().primaryKey(),
  apiKeyId: int("apiKeyId").notNull(),
  userId: int("userId").notNull(),
  endpoint: varchar("endpoint", { length: 256 }).notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  statusCode: int("statusCode").notNull(),
  responseMs: int("responseMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiUsageLog = typeof apiUsageLogs.$inferSelect;
export type InsertApiUsageLog = typeof apiUsageLogs.$inferInsert;

// ─── V5.1: Self-Improvement Engine ──────────────────────────────────

/**
 * System snapshots — saved before any self-modification.
 * Each snapshot captures the state of modified files so we can
 * roll back to the last known good state if a change breaks things.
 */
export const systemSnapshots = mysqlTable("system_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  triggeredBy: varchar("triggeredBy", { length: 64 }).notNull(), // "titan_assistant", "admin", "auto"
  reason: text("reason").notNull(), // why the snapshot was taken
  fileCount: int("fileCount").default(0).notNull(),
  status: mysqlEnum("status", ["active", "rolled_back", "superseded"]).default("active").notNull(),
  isKnownGood: int("isKnownGood").default(0).notNull(), // 1 = validated as working
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SystemSnapshot = typeof systemSnapshots.$inferSelect;
export type InsertSystemSnapshot = typeof systemSnapshots.$inferInsert;

/**
 * Snapshot files — individual file contents captured in a snapshot.
 */
export const snapshotFiles = mysqlTable("snapshot_files", {
  id: int("id").autoincrement().primaryKey(),
  snapshotId: int("snapshotId").notNull(),
  filePath: varchar("filePath", { length: 512 }).notNull(),
  contentHash: varchar("contentHash", { length: 64 }).notNull(), // SHA-256
  content: text("content").notNull(), // full file content
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SnapshotFile = typeof snapshotFiles.$inferSelect;
export type InsertSnapshotFile = typeof snapshotFiles.$inferInsert;

/**
 * Self-modification log — audit trail of every change the system makes to itself.
 */
export const selfModificationLog = mysqlTable("self_modification_log", {
  id: int("id").autoincrement().primaryKey(),
  snapshotId: int("snapshotId"), // snapshot taken before this change
  requestedBy: varchar("requestedBy", { length: 64 }).notNull(), // "titan_assistant", "admin"
  userId: int("userId"), // who triggered it
  action: mysqlEnum("action", [
    "modify_file",
    "create_file",
    "delete_file",
    "modify_config",
    "add_dependency",
    "restart_service",
    "rollback",
    "validate",
  ]).notNull(),
  targetFile: varchar("targetFile", { length: 512 }),
  description: text("description").notNull(),
  validationResult: mysqlEnum("validationResult", ["passed", "failed", "skipped"]),
  applied: int("applied").default(0).notNull(), // 1 = change was applied
  rolledBack: int("rolledBack").default(0).notNull(), // 1 = change was rolled back
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SelfModificationLogEntry = typeof selfModificationLog.$inferSelect;
export type InsertSelfModificationLogEntry = typeof selfModificationLog.$inferInsert;

// ─── Chat Conversations ──────────────────────────────────────────
export const chatConversations = mysqlTable("chat_conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull().default("New Conversation"),
  pinned: int("pinned").default(0).notNull(), // 1 = pinned
  archived: int("archived").default(0).notNull(), // 1 = archived
  messageCount: int("messageCount").default(0).notNull(),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatConversation = typeof chatConversations.$inferInsert;

// ─── Chat Messages ───────────────────────────────────────────────
export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["user", "assistant", "system", "tool"]).notNull(),
  content: text("content").notNull(),
  toolCalls: json("toolCalls").$type<Array<{ name: string; args: Record<string, unknown>; result: unknown }>>(),
  actionsTaken: json("actionsTaken").$type<Array<{ tool: string; success: boolean; summary: string }>>(),
  tokenCount: int("tokenCount"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// ─── V6.0: Builder Activity Log ──────────────────────────────────────

export const builderActivityLog = mysqlTable("builder_activity_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tool: varchar("tool", { length: 64 }).notNull(), // self_type_check, self_run_tests, self_multi_file_modify
  status: mysqlEnum("status", ["success", "failure", "error"]).notNull(),
  summary: text("summary"), // e.g. "TypeScript: 0 errors", "Tests: 582 passed"
  durationMs: int("durationMs"), // execution time in milliseconds
  details: json("details").$type<Record<string, unknown>>(), // extra context (error output, file list, etc.)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BuilderActivity = typeof builderActivityLog.$inferSelect;
export type InsertBuilderActivity = typeof builderActivityLog.$inferInsert;

// ─── Self-Improvement Task Backlog ───────────────────────────────────
export const improvementTasks = mysqlTable("improvement_tasks", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description").notNull(),
  category: mysqlEnum("category", [
    "performance",
    "security",
    "ux",
    "feature",
    "reliability",
    "testing",
    "infrastructure",
  ]).notNull(),
  priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).notNull().default("medium"),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "failed", "skipped"]).notNull().default("pending"),
  complexity: mysqlEnum("complexity", ["trivial", "small", "medium", "large", "epic"]).notNull().default("medium"),
  estimatedFiles: int("estimatedFiles").default(1),
  assignedBy: mysqlEnum("assignedBy", ["system", "admin", "titan"]).notNull().default("system"),
  completedAt: timestamp("completedAt"),
  completionNotes: text("completionNotes"),
  snapshotId: int("snapshotId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ImprovementTask = typeof improvementTasks.$inferSelect;
export type InsertImprovementTask = typeof improvementTasks.$inferInsert;

// ─── Credit System ───────────────────────────────────────────────────

/**
 * Credit balances per user — tracks current credits and lifetime usage.
 * Admin users are flagged as unlimited and bypass all credit checks.
 */
export const creditBalances = mysqlTable("credit_balances", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  credits: int("credits").notNull().default(0),
  lifetimeCreditsUsed: int("lifetimeCreditsUsed").notNull().default(0),
  lifetimeCreditsAdded: int("lifetimeCreditsAdded").notNull().default(0),
  isUnlimited: boolean("isUnlimited").notNull().default(false), // admin bypass
  lastRefillAt: timestamp("lastRefillAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CreditBalance = typeof creditBalances.$inferSelect;
export type InsertCreditBalance = typeof creditBalances.$inferInsert;

/**
 * Credit transaction log — every credit add/consume is recorded.
 */
export const creditTransactions = mysqlTable("credit_transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  amount: int("amount").notNull(), // positive = added, negative = consumed
  type: mysqlEnum("type", [
    "signup_bonus",
    "monthly_refill",
    "pack_purchase",
    "admin_adjustment",
    "chat_message",
    "builder_action",
    "voice_action",
    "referral_bonus",
    "marketplace_purchase",
    "marketplace_sale",
    "marketplace_refund",
    "marketplace_seller_fee",
    "marketplace_seller_renewal",
    "marketplace_feature",
    "marketplace_boost",
    "marketplace_verification",
  ]).notNull(),
  description: text("description"),
  balanceAfter: int("balanceAfter").notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = typeof creditTransactions.$inferInsert;

// ─── Desktop Licenses ───────────────────────────────────────────────

/**
 * Desktop app license keys — issued on activation, validated on each launch.
 * Admin users get unlimited licenses. Paid users get licenses tied to their plan.
 * Each device gets a unique license; users can deactivate old devices.
 */
export const desktopLicenses = mysqlTable("desktop_licenses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  deviceId: varchar("deviceId", { length: 128 }).notNull(), // unique per machine
  deviceName: varchar("deviceName", { length: 256 }), // e.g. "John's MacBook Pro"
  platform: varchar("platform", { length: 32 }).notNull(), // "win32", "darwin", "linux"
  licenseKey: varchar("licenseKey", { length: 512 }).notNull(), // JWT token
  status: mysqlEnum("status", ["active", "revoked", "expired"]).default("active").notNull(),
  lastValidatedAt: timestamp("lastValidatedAt"),
  lastIpAddress: varchar("lastIpAddress", { length: 64 }),
  activatedAt: timestamp("activatedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(), // 30 days, auto-refreshed
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DesktopLicense = typeof desktopLicenses.$inferSelect;
export type InsertDesktopLicense = typeof desktopLicenses.$inferInsert;

// ─── V7.1: Credential Import History ────────────────────────────
export const credentialImports = mysqlTable("credential_imports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  source: varchar("source", { length: 64 }).notNull(), // "1password", "lastpass", "bitwarden", "csv"
  fileName: varchar("fileName", { length: 256 }),
  totalEntries: int("totalEntries").default(0).notNull(),
  importedCount: int("importedCount").default(0).notNull(),
  skippedCount: int("skippedCount").default(0).notNull(),
  errorCount: int("errorCount").default(0).notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  errorDetails: json("errorDetails").$type<string[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CredentialImport = typeof credentialImports.$inferSelect;
export type InsertCredentialImport = typeof credentialImports.$inferInsert;

// ─── V7.1: TOTP Vault (external service authenticator codes) ────
export const totpSecrets = mysqlTable("totp_secrets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 256 }).notNull(), // e.g. "GitHub", "AWS Console"
  issuer: varchar("issuer", { length: 256 }), // e.g. "GitHub"
  encryptedSecret: text("encryptedSecret").notNull(), // AES-256 encrypted TOTP secret
  algorithm: varchar("algorithm", { length: 16 }).default("SHA1"), // SHA1, SHA256, SHA512
  digits: int("digits").default(6).notNull(), // 6 or 8
  period: int("period").default(30).notNull(), // seconds
  iconUrl: varchar("iconUrl", { length: 512 }),
  tags: json("tags").$type<string[]>(),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TotpSecret = typeof totpSecrets.$inferSelect;
export type InsertTotpSecret = typeof totpSecrets.$inferInsert;

// ─── V7.1: Notification Channels (Slack/Discord webhooks) ──────
export const notificationChannels = mysqlTable("notification_channels", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["slack", "discord", "email"]).notNull(),
  webhookUrl: text("webhookUrl"), // Slack/Discord webhook URL
  emailAddress: varchar("emailAddress", { length: 320 }),
  events: json("events").$type<string[]>().notNull(), // events to subscribe to
  active: boolean("active").default(true).notNull(),
  lastNotifiedAt: timestamp("lastNotifiedAt"),
  failCount: int("failCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type InsertNotificationChannel = typeof notificationChannels.$inferInsert;

// ==========================================
// GRANT FINDER + CROWDFUNDING TABLES
// ==========================================

export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  industry: varchar("industry", { length: 255 }),
  businessType: varchar("businessType", { length: 255 }),
  technologyArea: text("technologyArea"),
  employeeCount: int("employeeCount"),
  annualRevenue: int("annualRevenue"),
  foundedYear: int("foundedYear"),
  location: varchar("location", { length: 255 }),
  country: varchar("country", { length: 64 }),
  website: varchar("website", { length: 512 }),
  description: text("description"),
  minorityOwned: int("minorityOwned").default(0),
  womenOwned: int("womenOwned").default(0),
  veteranOwned: int("veteranOwned").default(0),
  indigenousOwned: int("indigenousOwned").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

export const businessPlans = mysqlTable("businessPlans", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => companies.id),
  title: varchar("title", { length: 255 }).notNull(),
  executiveSummary: text("executiveSummary"),
  technologyDescription: text("technologyDescription"),
  marketAnalysis: text("marketAnalysis"),
  competitiveAnalysis: text("competitiveAnalysis"),
  teamQualifications: text("teamQualifications"),
  researchPlan: text("researchPlan"),
  commercializationStrategy: text("commercializationStrategy"),
  financialProjections: text("financialProjections"),
  ipStrategy: text("ipStrategy"),
  version: int("version").default(1).notNull(),
  status: mysqlEnum("status", ["draft", "completed", "archived"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BusinessPlan = typeof businessPlans.$inferSelect;
export type InsertBusinessPlan = typeof businessPlans.$inferInsert;

export const grantOpportunities = mysqlTable("grantOpportunities", {
  id: int("id").autoincrement().primaryKey(),
  agency: varchar("agency", { length: 255 }).notNull(),
  programName: varchar("programName", { length: 255 }).notNull(),
  opportunityNumber: varchar("opportunityNumber", { length: 255 }),
  title: text("title").notNull(),
  description: text("description"),
  focusAreas: text("focusAreas"),
  region: varchar("region", { length: 64 }).default("USA").notNull(),
  country: varchar("country", { length: 128 }),
  minAmount: int("minAmount"),
  maxAmount: int("maxAmount"),
  currency: varchar("currency", { length: 8 }),
  phase: varchar("phase", { length: 50 }),
  eligibilityCriteria: text("eligibilityCriteria"),
  applicationDeadline: timestamp("applicationDeadline"),
  openDate: timestamp("openDate"),
  closeDate: timestamp("closeDate"),
  estimatedAwards: int("estimatedAwards"),
  competitiveness: varchar("competitiveness", { length: 50 }),
  url: text("url"),
  status: mysqlEnum("status", ["open", "closed", "upcoming"]).default("open").notNull(),
  industryTags: text("industryTags"),
  acceptsOverseas: boolean("acceptsOverseas").default(false),
  applicableCountries: text("applicableCountries"),
  sourceUrl: text("sourceUrl"),
  lastVerifiedAt: timestamp("lastVerifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GrantOpportunity = typeof grantOpportunities.$inferSelect;
export type InsertGrantOpportunity = typeof grantOpportunities.$inferInsert;

export const grantApplications = mysqlTable("grantApplications", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => companies.id),
  businessPlanId: int("businessPlanId").references(() => businessPlans.id),
  grantOpportunityId: int("grantOpportunityId").notNull().references(() => grantOpportunities.id),
  technicalAbstract: text("technicalAbstract"),
  projectDescription: text("projectDescription"),
  specificAims: text("specificAims"),
  innovation: text("innovation"),
  approach: text("approach"),
  commercializationPlan: text("commercializationPlan"),
  budget: text("budget"),
  budgetJustification: text("budgetJustification"),
  timeline: text("timeline"),
  successProbability: int("successProbability"),
  expectedValue: int("expectedValue"),
  qualityScore: int("qualityScore"),
  priority: int("priority"),
  status: mysqlEnum("status", ["draft", "ready", "submitted", "under_review", "awarded", "rejected"]).default("draft").notNull(),
  submittedAt: timestamp("submittedAt"),
  decisionDate: timestamp("decisionDate"),
  awardAmount: int("awardAmount"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GrantApplication = typeof grantApplications.$inferSelect;
export type InsertGrantApplication = typeof grantApplications.$inferInsert;

export const grantMatches = mysqlTable("grantMatches", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => companies.id),
  grantOpportunityId: int("grantOpportunityId").notNull().references(() => grantOpportunities.id),
  matchScore: int("matchScore").notNull(),
  eligibilityScore: int("eligibilityScore").notNull(),
  alignmentScore: int("alignmentScore").notNull(),
  competitivenessScore: int("competitivenessScore").notNull(),
  recommendationReason: text("recommendationReason"),
  estimatedSuccessProbability: int("estimatedSuccessProbability"),
  expectedValue: int("expectedValue"),
  isRecommended: int("isRecommended").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GrantMatch = typeof grantMatches.$inferSelect;
export type InsertGrantMatch = typeof grantMatches.$inferInsert;

export const crowdfundingCampaigns = mysqlTable("crowdfundingCampaigns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  companyId: int("companyId").references(() => companies.id),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  story: text("story"),
  category: varchar("category", { length: 100 }),
  goalAmount: int("goalAmount").notNull(),
  currentAmount: int("currentAmount").default(0).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  backerCount: int("backerCount").default(0).notNull(),
  imageUrl: varchar("imageUrl", { length: 500 }),
  videoUrl: varchar("videoUrl", { length: 500 }),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  status: mysqlEnum("status", ["draft", "active", "funded", "ended", "cancelled"]).default("draft").notNull(),
  featured: int("featured").default(0),
  // Hybrid model fields — external campaign aggregation
  source: mysqlEnum("source", ["internal", "kickstarter", "indiegogo", "gofundme", "other"]).default("internal").notNull(),
  externalId: varchar("externalId", { length: 255 }),
  externalUrl: varchar("externalUrl", { length: 500 }),
  creatorName: varchar("creatorName", { length: 255 }),
  creatorAvatarUrl: varchar("creatorAvatarUrl", { length: 500 }),
  location: varchar("location", { length: 255 }),
  percentFunded: int("percentFunded").default(0),
  daysLeft: int("daysLeft"),
  subcategory: varchar("subcategory", { length: 100 }),
  tags: json("tags").$type<string[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CrowdfundingCampaign = typeof crowdfundingCampaigns.$inferSelect;
export type InsertCrowdfundingCampaign = typeof crowdfundingCampaigns.$inferInsert;

export const crowdfundingRewards = mysqlTable("crowdfundingRewards", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull().references(() => crowdfundingCampaigns.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  minAmount: int("minAmount").notNull(),
  maxClaims: int("maxClaims"),
  claimedCount: int("claimedCount").default(0).notNull(),
  estimatedDelivery: timestamp("estimatedDelivery"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CrowdfundingReward = typeof crowdfundingRewards.$inferSelect;
export type InsertCrowdfundingReward = typeof crowdfundingRewards.$inferInsert;

export const crowdfundingContributions = mysqlTable("crowdfundingContributions", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull().references(() => crowdfundingCampaigns.id),
  userId: int("userId").references(() => users.id),
  amount: int("amount").notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  status: mysqlEnum("status", ["pending", "completed", "failed", "refunded"]).default("pending").notNull(),
  backerName: varchar("backerName", { length: 255 }),
  backerEmail: varchar("backerEmail", { length: 320 }),
  message: text("message"),
  anonymous: int("anonymous").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CrowdfundingContribution = typeof crowdfundingContributions.$inferSelect;
export type InsertCrowdfundingContribution = typeof crowdfundingContributions.$inferInsert;

export const crowdfundingUpdates = mysqlTable("crowdfundingUpdates", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull().references(() => crowdfundingCampaigns.id),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CrowdfundingUpdate = typeof crowdfundingUpdates.$inferSelect;
export type InsertCrowdfundingUpdate = typeof crowdfundingUpdates.$inferInsert;

// ─── V8.0: Persistent Sandboxes ──────────────────────────────────

export const sandboxes = mysqlTable("sandboxes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  osType: mysqlEnum("osType", ["linux"]).default("linux").notNull(), // expandable later
  status: mysqlEnum("status", ["creating", "running", "stopped", "error"]).default("creating").notNull(),
  // Persistent workspace stored in S3
  workspaceKey: varchar("workspaceKey", { length: 256 }), // S3 key for workspace tarball
  workingDirectory: varchar("workingDirectory", { length: 512 }).default("/home/sandbox").notNull(),
  // Resource limits
  memoryMb: int("memoryMb").default(512).notNull(),
  diskMb: int("diskMb").default(2048).notNull(),
  timeoutSeconds: int("timeoutSeconds").default(300).notNull(), // max command execution time
  // Usage tracking
  totalCommands: int("totalCommands").default(0).notNull(),
  totalSessionTime: int("totalSessionTime").default(0).notNull(), // seconds
  lastActiveAt: timestamp("lastActiveAt"),
  // Installed packages cache (so we know what's installed across sessions)
  installedPackages: json("installedPackages").$type<string[]>(),
  // Environment variables set by the user
  envVars: json("envVars").$type<Record<string, string>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Sandbox = typeof sandboxes.$inferSelect;
export type InsertSandbox = typeof sandboxes.$inferInsert;

export const sandboxCommands = mysqlTable("sandbox_commands", {
  id: int("id").autoincrement().primaryKey(),
  sandboxId: int("sandboxId").notNull(),
  userId: int("userId").notNull(),
  command: text("command").notNull(),
  output: text("output"), // stdout + stderr combined
  exitCode: int("exitCode"),
  workingDirectory: varchar("workingDirectory", { length: 512 }),
  durationMs: int("durationMs"),
  triggeredBy: mysqlEnum("triggeredBy", ["user", "ai", "system"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SandboxCommand = typeof sandboxCommands.$inferSelect;
export type InsertSandboxCommand = typeof sandboxCommands.$inferInsert;

export const sandboxFiles = mysqlTable("sandbox_files", {
  id: int("id").autoincrement().primaryKey(),
  sandboxId: int("sandboxId").notNull(),
  filePath: varchar("filePath", { length: 512 }).notNull(),
  content: text("content"), // for small text files
  s3Key: varchar("s3Key", { length: 256 }), // for larger files stored in S3
  fileSize: int("fileSize").default(0).notNull(),
  isDirectory: int("isDirectory").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SandboxFile = typeof sandboxFiles.$inferSelect;
export type InsertSandboxFile = typeof sandboxFiles.$inferInsert;

// ─── Website Replicate Projects ──────────────────────────────────────

export const replicateProjects = mysqlTable("replicate_projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sandboxId: int("sandboxId"),
  // Target info
  targetUrl: varchar("targetUrl", { length: 2048 }).notNull(),
  targetName: varchar("targetName", { length: 256 }).notNull(),
  targetDescription: text("targetDescription"),
  // Research results (JSON blob from LLM analysis)
  researchData: json("researchData").$type<{
    appName: string;
    description: string;
    targetAudience: string;
    coreFeatures: string[];
    uiPatterns: string[];
    techStackGuess: string[];
    dataModels: string[];
    apiEndpoints: string[];
    authMethod: string;
    monetization: string;
    keyDifferentiators: string[];
    suggestedTechStack: string;
    estimatedComplexity: string;
    mvpFeatures: string[];
    fullFeatures: string[];
  }>(),
  // Build plan (JSON blob)
  buildPlan: json("buildPlan").$type<{
    projectName: string;
    description: string;
    techStack: { frontend: string; backend: string; database: string; other: string };
    fileStructure: Array<{ path: string; description: string; priority: number }>;
    buildSteps: Array<{ step: number; description: string; files: string[]; commands: string[] }>;
    dataModels: Array<{ name: string; fields: string[] }>;
    apiRoutes: Array<{ method: string; path: string; description: string }>;
    estimatedFiles: number;
    estimatedTimeMinutes: number;
  }>(),
  // Custom branding
  brandName: varchar("brandName", { length: 256 }),
  brandColors: json("brandColors").$type<{ primary: string; secondary: string; accent: string; background: string; text: string }>(),
  brandLogo: text("brandLogo"), // URL to logo
  brandTagline: varchar("brandTagline", { length: 512 }),
  // Stripe integration
  stripePublishableKey: text("stripePublishableKey"),
  stripeSecretKey: text("stripeSecretKey"),
  stripePriceIds: json("stripePriceIds").$type<string[]>(),
  // GitHub PAT for this specific clone project
  githubPat: text("githubPat"),
  githubRepoUrl: text("githubRepoUrl"),
  // Build status
  status: mysqlEnum("status", [
    "researching",
    "research_complete",
    "planning",
    "plan_complete",
    "building",
    "build_complete",
    "branded",
    "pushing",
    "pushed",
    "deploying",
    "deployed",
    "testing",
    "complete",
    "error",
  ]).default("researching").notNull(),
  currentStep: int("currentStep").default(0).notNull(),
  totalSteps: int("totalSteps").default(0).notNull(),
  statusMessage: text("statusMessage"),
  errorMessage: text("errorMessage"),
  // Build output
  buildLog: json("buildLog").$type<Array<{ step: number; status: string; message: string; timestamp: string }>>(),
  outputFiles: json("outputFiles").$type<string[]>(),
  previewUrl: text("previewUrl"),
  // Priority
  priority: mysqlEnum("priority", ["mvp", "full"]).default("mvp").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReplicateProject = typeof replicateProjects.$inferSelect;
export type InsertReplicateProject = typeof replicateProjects.$inferInsert;

// ─── Autonomous Marketing Engine ──────────────────────────────────────

/**
 * Marketing budget configuration — admin sets monthly spend, AI allocates across channels
 */
export const marketingBudgets = mysqlTable("marketing_budgets", {
  id: int("id").autoincrement().primaryKey(),
  month: varchar("month", { length: 7 }).notNull(), // "2026-02" format
  totalBudget: int("totalBudget").notNull(), // cents
  status: mysqlEnum("status", ["draft", "active", "paused", "completed"]).default("draft").notNull(),
  allocations: json("allocations").$type<Array<{
    channel: string;
    amount: number; // cents
    reasoning: string;
  }>>(),
  actualSpend: int("actualSpend").default(0).notNull(), // cents
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MarketingBudget = typeof marketingBudgets.$inferSelect;

/**
 * Marketing campaigns — individual campaigns across channels
 */
export const marketingCampaigns = mysqlTable("marketing_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId"),
  channel: mysqlEnum("channel", ["meta", "google_ads", "x_twitter", "linkedin", "snapchat", "content_seo"]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["draft", "pending_review", "active", "paused", "completed", "failed"]).default("draft").notNull(),
  type: mysqlEnum("type", ["awareness", "engagement", "conversion", "retargeting"]).notNull(),
  targetAudience: json("targetAudience").$type<{
    demographics?: { ageMin?: number; ageMax?: number; genders?: string[]; };
    interests?: string[];
    locations?: string[];
    customAudiences?: string[];
  }>(),
  dailyBudget: int("dailyBudget").default(0).notNull(), // cents
  totalBudget: int("totalBudget").default(0).notNull(), // cents
  totalSpend: int("totalSpend").default(0).notNull(), // cents
  externalCampaignId: varchar("externalCampaignId", { length: 255 }), // ID from the ad platform
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  impressions: int("impressions").default(0).notNull(),
  clicks: int("clicks").default(0).notNull(),
  conversions: int("conversions").default(0).notNull(),
  aiStrategy: text("aiStrategy"), // AI's reasoning for this campaign
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;

/**
 * Marketing content — AI-generated content pieces (posts, ads, articles)
 */
export const marketingContent = mysqlTable("marketing_content", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId"),
  channel: mysqlEnum("channel", ["meta", "google_ads", "x_twitter", "linkedin", "snapchat", "content_seo", "devto", "medium", "hashnode", "discord", "mastodon", "telegram", "whatsapp", "pinterest", "reddit", "tiktok", "youtube", "quora", "skool", "indiehackers", "hackernews", "producthunt", "email_outreach", "sendgrid", "hacker_forum"]).notNull(),
  contentType: mysqlEnum("contentType", ["social_post", "ad_copy", "blog_article", "email", "image_ad", "video_script", "backlink_outreach", "email_nurture", "community_engagement", "hacker_forum_post", "content_queue"]).notNull(),
  title: varchar("title", { length: 500 }),
  body: text("body").notNull(),
  mediaUrl: text("mediaUrl"), // S3 URL for generated images/videos
  hashtags: json("hashtags").$type<string[]>(),
  platform: varchar("platform", { length: 128 }), // extended platform identifier
  headline: varchar("headline", { length: 500 }), // alternative headline field
  metadata: json("metadata").$type<Record<string, any>>(), // extra metadata for content queue
  status: mysqlEnum("status", ["draft", "approved", "published", "failed"]).default("draft").notNull(),
  externalPostId: varchar("externalPostId", { length: 255 }), // ID from the platform after publishing
  publishedAt: timestamp("publishedAt"),
  impressions: int("impressions").default(0).notNull(),
  engagements: int("engagements").default(0).notNull(),
  clicks: int("clicks").default(0).notNull(),
  aiPrompt: text("aiPrompt"), // The prompt used to generate this content
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MarketingContentRow = typeof marketingContent.$inferSelect;

/**
 * Marketing performance snapshots — daily aggregated metrics per channel
 */
export const marketingPerformance = mysqlTable("marketing_performance", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull(), // "2026-02-15" format
  channel: mysqlEnum("channel", ["meta", "google_ads", "x_twitter", "linkedin", "snapchat", "content_seo", "devto", "medium", "hashnode", "discord", "mastodon", "telegram", "whatsapp", "pinterest", "reddit", "tiktok", "youtube", "quora", "skool", "indiehackers", "hackernews", "producthunt", "email_outreach", "sendgrid", "hacker_forum"]).notNull(),
  impressions: int("impressions").default(0).notNull(),
  clicks: int("clicks").default(0).notNull(),
  conversions: int("conversions").default(0).notNull(),
  spend: int("spend").default(0).notNull(), // cents
  cpc: int("cpc").default(0).notNull(), // cents — cost per click
  cpm: int("cpm").default(0).notNull(), // cents — cost per 1000 impressions
  ctr: varchar("ctr", { length: 10 }).default("0").notNull(), // click-through rate as string "2.5"
  roas: varchar("roas", { length: 10 }).default("0").notNull(), // return on ad spend as string "3.2"
  signups: int("signups").default(0).notNull(), // new Titan signups attributed
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MarketingPerformanceRow = typeof marketingPerformance.$inferSelect;

/**
 * Marketing engine activity log — tracks all autonomous decisions and actions
 */
export const marketingActivityLog = mysqlTable("marketing_activity_log", {
  id: int("id").autoincrement().primaryKey(),
  action: varchar("action", { length: 100 }).notNull(),
  channel: varchar("channel", { length: 50 }),
  details: json("details").$type<Record<string, any>>(),
  status: mysqlEnum("status", ["success", "failed", "skipped"]).default("success").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MarketingActivityLogRow = typeof marketingActivityLog.$inferSelect;

/**
 * Marketing engine settings — key/value store for engine configuration
 */
export const marketingSettings = mysqlTable("marketing_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MarketingSettingRow = typeof marketingSettings.$inferSelect;

// ─── Custom Providers (User-Defined API Integrations) ─────────────

export const customProviders = mysqlTable("custom_providers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(), // unique identifier, auto-generated from name
  icon: varchar("icon", { length: 10 }).default("🔌"), // emoji icon
  category: varchar("category", { length: 50 }).default("custom").notNull(),
  loginUrl: text("loginUrl").notNull(),
  keysUrl: text("keysUrl").notNull(),
  keyTypes: json("keyTypes").$type<string[]>().notNull(), // e.g. ["api_key", "secret_key"]
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CustomProviderRow = typeof customProviders.$inferSelect;
export type InsertCustomProvider = typeof customProviders.$inferInsert;

// ─── Affiliate Marketing System ──────────────────────────────────────

/**
 * Affiliate partners — companies/individuals who promote Titan
 * and earn commissions on referrals
 */
export const affiliatePartners = mysqlTable("affiliate_partners", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  domain: varchar("domain", { length: 512 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  vertical: mysqlEnum("vertical", ["ai_tools", "hosting", "dev_tools", "security", "vpn", "crypto", "saas", "education", "other"]).default("other").notNull(),
  commissionType: mysqlEnum("commissionType", ["revshare", "cpa", "hybrid", "cpm", "cpc"]).default("cpa").notNull(),
  commissionRate: int("commissionRate").default(20).notNull(), // percentage or cents depending on type
  tier: mysqlEnum("tier", ["bronze", "silver", "gold", "platinum"]).default("bronze").notNull(),
  status: mysqlEnum("status", ["prospect", "applied", "active", "paused", "rejected", "churned"]).default("prospect").notNull(),
  affiliateUrl: text("affiliateUrl"), // their affiliate link for us to promote
  applicationUrl: text("applicationUrl"), // where to apply for their program
  applicationEmail: varchar("applicationEmail", { length: 320 }),
  applicationSentAt: timestamp("applicationSentAt"),
  approvedAt: timestamp("approvedAt"),
  totalClicks: int("totalClicks").default(0).notNull(),
  totalConversions: int("totalConversions").default(0).notNull(),
  totalEarnings: int("totalEarnings").default(0).notNull(), // in cents
  performanceScore: int("performanceScore").default(0).notNull(), // 0-100
  lastOptimizedAt: timestamp("lastOptimizedAt"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AffiliatePartner = typeof affiliatePartners.$inferSelect;
export type InsertAffiliatePartner = typeof affiliatePartners.$inferInsert;

/**
 * Affiliate clicks — tracks every outbound click to a partner
 */
export const affiliateClicks = mysqlTable("affiliate_clicks", {
  id: int("id").autoincrement().primaryKey(),
  partnerId: int("partnerId").notNull(),
  userId: int("userId"), // null for anonymous clicks
  clickId: varchar("clickId", { length: 64 }).notNull().unique(),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  referrer: text("referrer"),
  utmSource: varchar("utmSource", { length: 128 }),
  utmMedium: varchar("utmMedium", { length: 128 }),
  utmCampaign: varchar("utmCampaign", { length: 128 }),
  converted: boolean("converted").default(false).notNull(),
  conversionDate: timestamp("conversionDate"),
  commissionEarned: int("commissionEarned").default(0).notNull(), // in cents
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AffiliateClick = typeof affiliateClicks.$inferSelect;
export type InsertAffiliateClick = typeof affiliateClicks.$inferInsert;

/**
 * Referral program — users refer friends and earn rewards
 */
export const referralCodes = mysqlTable("referral_codes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // the referrer
  code: varchar("code", { length: 16 }).notNull().unique(),
  totalReferrals: int("totalReferrals").default(0).notNull(),
  totalRewardsEarned: int("totalRewardsEarned").default(0).notNull(),
  totalCommissionCents: int("totalCommissionCents").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ReferralCode = typeof referralCodes.$inferSelect;
export type InsertReferralCode = typeof referralCodes.$inferInsert;

/**
 * Referral conversions — tracks when a referred user signs up or pays
 */
export const referralConversions = mysqlTable("referral_conversions", {
  id: int("id").autoincrement().primaryKey(),
  referralCodeId: int("referralCodeId").notNull(),
  referrerId: int("referrerId").notNull(), // the user who referred
  referredUserId: int("referredUserId").notNull(), // the new user
  status: mysqlEnum("status", ["signed_up", "subscribed", "rewarded"]).default("signed_up").notNull(),
  rewardType: mysqlEnum("rewardType", ["free_month", "commission", "credit", "tier_upgrade", "discount", "high_value_discount"]).default("discount"),
  rewardAmountCents: int("rewardAmountCents").default(0).notNull(),
  rewardGrantedAt: timestamp("rewardGrantedAt"),
  subscriptionId: varchar("subscriptionId", { length: 256 }), // Stripe subscription ID if they paid
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ReferralConversion = typeof referralConversions.$inferSelect;
export type InsertReferralConversion = typeof referralConversions.$inferInsert;

/**
 * Affiliate payouts — tracks commission payouts to partners
 */
export const affiliatePayouts = mysqlTable("affiliate_payouts", {
  id: int("id").autoincrement().primaryKey(),
  partnerId: int("partnerId").notNull(),
  amountCents: int("amountCents").notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 64 }), // stripe, paypal, bank_transfer
  paymentReference: varchar("paymentReference", { length: 256 }),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  clickCount: int("clickCount").default(0).notNull(),
  conversionCount: int("conversionCount").default(0).notNull(),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AffiliatePayout = typeof affiliatePayouts.$inferSelect;
export type InsertAffiliatePayout = typeof affiliatePayouts.$inferInsert;

/**
 * Affiliate outreach — tracks autonomous partner discovery and outreach
 */
export const affiliateOutreach = mysqlTable("affiliate_outreach", {
  id: int("id").autoincrement().primaryKey(),
  partnerId: int("partnerId").notNull(),
  type: mysqlEnum("type", ["email", "form", "api"]).default("email").notNull(),
  subject: text("subject"),
  body: text("body"),
  status: mysqlEnum("status", ["drafted", "sent", "opened", "replied", "accepted", "rejected"]).default("drafted").notNull(),
  sentAt: timestamp("sentAt"),
  repliedAt: timestamp("repliedAt"),
  aiGenerated: boolean("aiGenerated").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AffiliateOutreach = typeof affiliateOutreach.$inferSelect;
export type InsertAffiliateOutreach = typeof affiliateOutreach.$inferInsert;

// ─── Autonomous Affiliate Discovery System ──────────────────────────

/**
 * Discovered affiliate programs — found by the autonomous discovery engine
 * Runs twice a week (Wed + Sat) to find new revenue opportunities
 */
export const affiliateDiscoveries = mysqlTable("affiliate_discoveries", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  domain: varchar("domain", { length: 512 }).notNull(),
  description: text("description"),
  vertical: mysqlEnum("vertical_disc", ["ai_tools", "hosting", "dev_tools", "security", "vpn", "crypto", "saas", "education", "automation", "analytics", "design", "marketing", "fintech", "other"]).default("other").notNull(),
  estimatedCommissionType: mysqlEnum("estimatedCommissionType", ["revshare", "cpa", "hybrid", "unknown"]).default("unknown").notNull(),
  estimatedCommissionRate: int("estimatedCommissionRate").default(0).notNull(),
  revenueScore: int("revenueScore").default(0).notNull(), // 0-100 estimated revenue potential
  relevanceScore: int("relevanceScore").default(0).notNull(), // 0-100 relevance to Titan users
  overallScore: int("overallScore").default(0).notNull(), // combined weighted score
  affiliateProgramUrl: text("affiliateProgramUrl"),
  signupUrl: text("signupUrl"),
  contactEmail: varchar("contactEmail", { length: 320 }),
  networkName: varchar("networkName", { length: 128 }), // ShareASale, CJ, Impact, PartnerStack, direct
  status: mysqlEnum("discovery_status", ["discovered", "evaluating", "approved", "applied", "accepted", "rejected", "skipped"]).default("discovered").notNull(),
  applicationStatus: mysqlEnum("applicationStatus", ["not_applied", "application_drafted", "application_sent", "pending_review", "approved", "rejected"]).default("not_applied").notNull(),
  applicationDraftedAt: timestamp("applicationDraftedAt"),
  applicationSentAt: timestamp("disc_applicationSentAt"),
  applicationResponseAt: timestamp("applicationResponseAt"),
  discoveredBy: mysqlEnum("discoveredBy", ["llm_search", "network_crawl", "competitor_analysis", "manual"]).default("llm_search").notNull(),
  discoveryBatchId: varchar("discoveryBatchId", { length: 64 }),
  notes: text("notes"),
  metadata: json("disc_metadata").$type<Record<string, unknown>>(),
  promotedToPartnerId: int("promotedToPartnerId"), // if promoted to full affiliate_partners table
  createdAt: timestamp("disc_createdAt").defaultNow().notNull(),
  updatedAt: timestamp("disc_updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AffiliateDiscovery = typeof affiliateDiscoveries.$inferSelect;
export type InsertAffiliateDiscovery = typeof affiliateDiscoveries.$inferInsert;

/**
 * Discovery run logs — tracks each autonomous discovery run
 */
export const affiliateDiscoveryRuns = mysqlTable("affiliate_discovery_runs", {
  id: int("id").autoincrement().primaryKey(),
  batchId: varchar("batchId", { length: 64 }).notNull().unique(),
  runType: mysqlEnum("runType", ["scheduled", "manual", "startup"]).default("scheduled").notNull(),
  status: mysqlEnum("run_status", ["running", "completed", "failed", "killed"]).default("running").notNull(),
  programsDiscovered: int("programsDiscovered").default(0).notNull(),
  programsEvaluated: int("programsEvaluated").default(0).notNull(),
  programsApproved: int("programsApproved").default(0).notNull(),
  applicationsGenerated: int("applicationsGenerated").default(0).notNull(),
  applicationsSent: int("applicationsSent").default(0).notNull(),
  searchQueries: json("searchQueries").$type<string[]>(),
  errors: json("run_errors").$type<string[]>(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs").default(0).notNull(),
  killSwitchTriggered: boolean("killSwitchTriggered").default(false).notNull(),
});
export type AffiliateDiscoveryRun = typeof affiliateDiscoveryRuns.$inferSelect;
export type InsertAffiliateDiscoveryRun = typeof affiliateDiscoveryRuns.$inferInsert;

/**
 * Application templates — AI-generated application messages for affiliate programs
 */
export const affiliateApplications = mysqlTable("affiliate_applications", {
  id: int("id").autoincrement().primaryKey(),
  discoveryId: int("discoveryId").notNull(),
  applicationType: mysqlEnum("applicationType", ["email", "form_fill", "api_signup", "network_apply"]).default("email").notNull(),
  subject: text("app_subject"),
  body: text("app_body"),
  formData: json("formData").$type<Record<string, string>>(),
  status: mysqlEnum("app_status", ["drafted", "approved", "sent", "pending", "accepted", "rejected"]).default("drafted").notNull(),
  sentAt: timestamp("app_sentAt"),
  responseReceivedAt: timestamp("responseReceivedAt"),
  responseContent: text("responseContent"),
  aiGenerated: boolean("app_aiGenerated").default(true).notNull(),
  createdAt: timestamp("app_createdAt").defaultNow().notNull(),
});
export type AffiliateApplication = typeof affiliateApplications.$inferSelect;
export type InsertAffiliateApplication = typeof affiliateApplications.$inferInsert;

/**
 * Blog posts — SEO-optimized content for organic traffic
 */
export const blogPosts = mysqlTable("blog_posts", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  title: varchar("blog_title", { length: 500 }).notNull(),
  excerpt: text("excerpt"),
  content: text("blog_content").notNull(),
  coverImageUrl: text("coverImageUrl"),
  authorId: int("authorId"),
  category: varchar("category", { length: 100 }).notNull(),
  tags: json("tags").$type<string[]>().default([]),
  metaTitle: varchar("metaTitle", { length: 160 }),
  metaDescription: varchar("metaDescription", { length: 320 }),
  focusKeyword: varchar("focusKeyword", { length: 100 }),
  secondaryKeywords: json("secondaryKeywords").$type<string[]>().default([]),
  seoScore: int("seoScore").default(0),
  readingTimeMinutes: int("readingTimeMinutes").default(5),
  status: mysqlEnum("blog_status", ["draft", "published", "archived"]).default("draft").notNull(),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("blog_createdAt").defaultNow().notNull(),
  updatedAt: timestamp("blog_updatedAt").defaultNow().notNull(),
  viewCount: int("viewCount").default(0),
  aiGenerated: boolean("blog_aiGenerated").default(false).notNull(),
});
export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

/**
 * Blog categories — organize content by topic
 */
export const blogCategories = mysqlTable("blog_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("cat_name", { length: 100 }).notNull().unique(),
  slug: varchar("cat_slug", { length: 100 }).notNull().unique(),
  description: text("cat_description"),
  postCount: int("postCount").default(0),
  createdAt: timestamp("cat_createdAt").defaultNow().notNull(),
});
export type BlogCategory = typeof blogCategories.$inferSelect;
export type InsertBlogCategory = typeof blogCategories.$inferInsert;


// ─── User Secrets — Encrypted per-user API keys ─────────────────────────
// Each user can store their own OpenAI API key to get dedicated rate limits.
// Keys are encrypted at rest using AES-256-GCM (same as fetcherCredentials).
export const userSecrets = mysqlTable("user_secrets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  secretType: varchar("secretType", { length: 64 }).notNull(), // e.g. "openai_api_key"
  encryptedValue: text("encryptedValue").notNull(),
  label: varchar("label", { length: 128 }), // user-friendly label
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserSecret = typeof userSecrets.$inferSelect;
export type InsertUserSecret = typeof userSecrets.$inferInsert;

// ─── Marketplace — Grand Bazaar ─────────────────────────────────────
// Full marketplace for selling code, AI agents, modules, blueprints, and artifacts.
// Supports credit-based purchasing, user ratings, risk categorization, and unique item IDs.

export const marketplaceListings = mysqlTable("marketplace_listings", {
  id: int("id").autoincrement().primaryKey(),
  uid: varchar("uid", { length: 64 }).notNull().unique(),
  sellerId: int("sellerId").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  slug: varchar("slug", { length: 300 }).notNull().unique(),
  description: text("description").notNull(),
  longDescription: text("longDescription"),
  category: mysqlEnum("category", ["agents", "modules", "blueprints", "artifacts", "exploits", "templates", "datasets", "other"]).notNull().default("modules"),
  riskCategory: mysqlEnum("riskCategory", ["safe", "low_risk", "medium_risk", "high_risk"]).notNull().default("safe"),
  reviewStatus: mysqlEnum("reviewStatus", ["pending_review", "approved", "rejected", "flagged"]).notNull().default("pending_review"),
  reviewNotes: text("reviewNotes"),
  status: mysqlEnum("status", ["draft", "active", "paused", "sold_out", "removed"]).notNull().default("draft"),
  priceCredits: int("priceCredits").notNull(),
  priceUsd: int("priceUsd").notNull().default(0),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  fileUrl: text("fileUrl"),
  fileSize: int("fileSize"),
  fileType: varchar("fileType", { length: 64 }),
  fileHash: varchar("fileHash", { length: 128 }), // SHA-256 hash for anti-resale duplicate detection
  originalListingId: int("originalListingId"), // If flagged as resale, references the original listing
  previewUrl: text("previewUrl"),
  thumbnailUrl: text("thumbnailUrl"),
  demoUrl: text("demoUrl"),
  tags: text("tags"),
  language: varchar("language", { length: 64 }),
  license: varchar("license", { length: 64 }).default("MIT"),
  version: varchar("version", { length: 32 }).default("1.0.0"),
  totalSales: int("totalSales").notNull().default(0),
  totalRevenue: int("totalRevenue").notNull().default(0),
  viewCount: int("viewCount").notNull().default(0),
  downloadCount: int("downloadCount").notNull().default(0),
  avgRating: int("avgRating").notNull().default(0),
  ratingCount: int("ratingCount").notNull().default(0),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type InsertMarketplaceListing = typeof marketplaceListings.$inferInsert;

export const marketplacePurchases = mysqlTable("marketplace_purchases", {
  id: int("id").autoincrement().primaryKey(),
  uid: varchar("uid", { length: 64 }).notNull().unique(),
  buyerId: int("buyerId").notNull(),
  listingId: int("listingId").notNull(),
  sellerId: int("sellerId").notNull(),
  priceCredits: int("priceCredits").notNull(),
  priceUsd: int("priceUsd").notNull().default(0),
  status: mysqlEnum("status", ["completed", "refunded", "disputed"]).notNull().default("completed"),
  downloadCount: int("downloadCount").notNull().default(0),
  maxDownloads: int("maxDownloads").notNull().default(5),
  downloadToken: varchar("downloadToken", { length: 128 }),
  hasReviewed: boolean("hasReviewed").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MarketplacePurchase = typeof marketplacePurchases.$inferSelect;
export type InsertMarketplacePurchase = typeof marketplacePurchases.$inferInsert;

export const marketplaceReviews = mysqlTable("marketplace_reviews", {
  id: int("id").autoincrement().primaryKey(),
  listingId: int("listingId").notNull(),
  purchaseId: int("purchaseId").notNull(),
  reviewerId: int("reviewerId").notNull(),
  rating: int("rating").notNull(),
  title: varchar("title", { length: 256 }),
  comment: text("comment"),
  sellerRating: int("sellerRating"),
  helpful: int("helpful").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MarketplaceReview = typeof marketplaceReviews.$inferSelect;
export type InsertMarketplaceReview = typeof marketplaceReviews.$inferInsert;

export const sellerProfiles = mysqlTable("seller_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  bio: text("bio"),
  avatarUrl: text("avatarUrl"),
  totalSales: int("totalSales").notNull().default(0),
  totalRevenue: int("totalRevenue").notNull().default(0),
  avgRating: int("avgRating").notNull().default(0),
  ratingCount: int("ratingCount").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  // Seller subscription ($12/year to sell on the Bazaar)
  sellerSubscriptionActive: boolean("sellerSubscriptionActive").notNull().default(false),
  sellerSubscriptionExpiresAt: timestamp("sellerSubscriptionExpiresAt"),
  sellerSubscriptionPaidAt: timestamp("sellerSubscriptionPaidAt"),
  sellerSubscriptionStripeId: varchar("sellerSubscriptionStripeId", { length: 128 }),
  totalPlatformFeesPaid: int("totalPlatformFeesPaid").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SellerProfile = typeof sellerProfiles.$inferSelect;
export type InsertSellerProfile = typeof sellerProfiles.$inferInsert;

// ─── Crypto Payments for Crowdfunding ──────────────────────────────

export const cryptoPayments = mysqlTable("crypto_payments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  campaignId: int("campaignId").notNull(),
  contributionId: int("contributionId"),
  merchantTradeNo: varchar("merchantTradeNo", { length: 64 }).notNull().unique(),
  binancePrepayId: varchar("binancePrepayId", { length: 128 }),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  fiatAmount: varchar("fiatAmount", { length: 32 }).notNull(),
  fiatCurrency: varchar("fiatCurrency", { length: 8 }).notNull().default("USD"),
  cryptoCurrency: varchar("cryptoCurrency", { length: 16 }),
  cryptoAmount: varchar("cryptoAmount", { length: 64 }),
  platformFee: varchar("platformFee", { length: 32 }).notNull().default("0"),
  creatorAmount: varchar("creatorAmount", { length: 32 }).notNull().default("0"),
  checkoutUrl: text("checkoutUrl"),
  qrcodeLink: text("qrcodeLink"),
  donorName: varchar("donorName", { length: 128 }),
  donorEmail: varchar("donorEmail", { length: 256 }),
  donorMessage: text("donorMessage"),
  webhookData: text("webhookData"),
  paidAt: timestamp("paidAt"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CryptoPayment = typeof cryptoPayments.$inferSelect;
export type InsertCryptoPayment = typeof cryptoPayments.$inferInsert;

// ─── Platform Revenue Tracking ─────────────────────────────────────

export const platformRevenue = mysqlTable("platform_revenue", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 64 }).notNull(),
  sourceId: varchar("sourceId", { length: 128 }),
  type: varchar("type", { length: 64 }).notNull(),
  amount: varchar("amount", { length: 32 }).notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  description: text("description"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PlatformRevenue = typeof platformRevenue.$inferSelect;
export type InsertPlatformRevenue = typeof platformRevenue.$inferInsert;

// ─── Seller Payout Methods ──────────────────────────────────────

export const sellerPayoutMethods = mysqlTable("seller_payout_methods", {
  id: int("id").autoincrement().primaryKey(),
  sellerId: int("sellerId").notNull(), // references seller_profiles.id
  userId: int("userId").notNull(), // references users.id
  // Payout method type
  methodType: mysqlEnum("methodType", ["bank_transfer", "paypal", "stripe_connect"]).notNull(),
  isDefault: boolean("isDefault").notNull().default(false),
  // Bank transfer (BSB + Account)
  bankBsb: varchar("bankBsb", { length: 16 }),
  bankAccountNumber: varchar("bankAccountNumber", { length: 32 }),
  bankAccountName: varchar("bankAccountName", { length: 128 }),
  bankName: varchar("bankName", { length: 128 }),
  bankCountry: varchar("bankCountry", { length: 64 }),
  bankSwiftBic: varchar("bankSwiftBic", { length: 16 }),
  // PayPal
  paypalEmail: varchar("paypalEmail", { length: 320 }),
  // Stripe Connect
  stripeConnectAccountId: varchar("stripeConnectAccountId", { length: 128 }),
  stripeConnectOnboarded: boolean("stripeConnectOnboarded").notNull().default(false),
  // Status
  verified: boolean("verified").notNull().default(false),
  status: mysqlEnum("status", ["active", "pending_verification", "disabled"]).notNull().default("pending_verification"),
  // Metadata
  label: varchar("label", { length: 128 }), // e.g. "My ANZ Account", "Business PayPal"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SellerPayoutMethod = typeof sellerPayoutMethods.$inferSelect;
export type InsertSellerPayoutMethod = typeof sellerPayoutMethods.$inferInsert;


// ═══════════════════════════════════════════════════════════════════
// ─── Website Health Monitor ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * Monitored websites — each site a user wants Titan to watch.
 * Stores connection details (API keys, SSH, login creds) for auto-repair.
 */
export const monitoredSites = mysqlTable("monitored_sites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  checkIntervalSeconds: int("checkIntervalSeconds").notNull().default(300),

  // ── Access Method ──
  accessMethod: mysqlEnum("accessMethod", [
    "none", "api", "ssh", "ftp", "login", "webhook",
    "railway", "vercel", "netlify", "render", "heroku",
  ]).notNull().default("none"),

  // ── Generic API Access ──
  apiEndpoint: text("apiEndpoint"),
  apiKey: text("apiKey"),                     // encrypted at rest
  apiHeaders: text("apiHeaders"),             // JSON — custom headers

  // ── Login-based Access ──
  loginUrl: text("loginUrl"),
  loginUsername: text("loginUsername"),        // encrypted
  loginPassword: text("loginPassword"),       // encrypted

  // ── SSH Access ──
  sshHost: varchar("sshHost", { length: 512 }),
  sshPort: int("sshPort").default(22),
  sshUsername: varchar("sshUsername", { length: 256 }),
  sshPrivateKey: text("sshPrivateKey"),       // encrypted

  // ── Platform-specific (Railway, Vercel, Netlify, Render, Heroku) ──
  platformProjectId: varchar("platformProjectId", { length: 256 }),
  platformServiceId: varchar("platformServiceId", { length: 256 }),
  platformToken: text("platformToken"),       // encrypted
  platformEnvironmentId: varchar("platformEnvironmentId", { length: 256 }),

  // ── Webhook-based Repair ──
  repairWebhookUrl: text("repairWebhookUrl"),
  repairWebhookSecret: text("repairWebhookSecret"),

  // ── Health Check Configuration ──
  expectedStatusCode: int("expectedStatusCode").default(200),
  expectedBodyContains: text("expectedBodyContains"),
  timeoutMs: int("timeoutMs").default(30000),
  followRedirects: boolean("followRedirects").default(true).notNull(),
  sslCheckEnabled: boolean("sslCheckEnabled").default(true).notNull(),
  performanceThresholdMs: int("performanceThresholdMs").default(5000),

  // ── Alert Configuration ──
  alertsEnabled: boolean("alertsEnabled").default(true).notNull(),
  alertEmail: varchar("alertEmail", { length: 320 }),
  alertWebhookUrl: text("alertWebhookUrl"),
  alertAfterConsecutiveFailures: int("alertAfterConsecutiveFailures").default(3),
  autoRepairEnabled: boolean("autoRepairEnabled").default(true).notNull(),

  // ── State ──
  isPaused: boolean("isPaused").default(false).notNull(),
  lastCheckAt: timestamp("lastCheckAt"),
  lastStatus: mysqlEnum("lastStatus", ["healthy", "degraded", "down", "error", "unknown"]).default("unknown").notNull(),
  lastResponseTimeMs: int("lastResponseTimeMs"),
  lastHttpStatusCode: int("lastHttpStatusCode"),
  consecutiveFailures: int("consecutiveFailures").default(0).notNull(),
  uptimePercent24h: varchar("uptimePercent24h", { length: 8 }),
  uptimePercent7d: varchar("uptimePercent7d", { length: 8 }),
  uptimePercent30d: varchar("uptimePercent30d", { length: 8 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MonitoredSite = typeof monitoredSites.$inferSelect;
export type InsertMonitoredSite = typeof monitoredSites.$inferInsert;

/**
 * Individual health check results — one row per check per site.
 */
export const healthChecks = mysqlTable("health_checks", {
  id: int("id").autoincrement().primaryKey(),
  siteId: int("siteId").notNull(),
  userId: int("userId").notNull(),

  status: mysqlEnum("status", ["healthy", "degraded", "down", "error"]).notNull(),
  httpStatusCode: int("httpStatusCode"),
  responseTimeMs: int("responseTimeMs"),

  // ── SSL Info ──
  sslValid: boolean("sslValid"),
  sslExpiresAt: timestamp("sslExpiresAt"),
  sslIssuer: varchar("sslIssuer", { length: 512 }),

  // ── Performance Metrics ──
  dnsTimeMs: int("dnsTimeMs"),
  connectTimeMs: int("connectTimeMs"),
  tlsTimeMs: int("tlsTimeMs"),
  ttfbMs: int("ttfbMs"),                     // time to first byte
  downloadTimeMs: int("downloadTimeMs"),
  totalTimeMs: int("totalTimeMs"),

  // ── Content Validation ──
  bodyContainsMatch: boolean("bodyContainsMatch"),
  contentLength: int("contentLength"),

  // ── Error Details ──
  errorMessage: text("errorMessage"),
  errorType: varchar("errorType", { length: 128 }),

  // ── Request Metadata ──
  checkedFromRegion: varchar("checkedFromRegion", { length: 64 }),
  checkedAt: timestamp("checkedAt").defaultNow().notNull(),
});
export type HealthCheck = typeof healthChecks.$inferSelect;
export type InsertHealthCheck = typeof healthChecks.$inferInsert;

/**
 * Incidents — detected problems that may require attention or auto-repair.
 */
export const siteIncidents = mysqlTable("site_incidents", {
  id: int("id").autoincrement().primaryKey(),
  siteId: int("siteId").notNull(),
  userId: int("userId").notNull(),

  type: mysqlEnum("type", [
    "downtime", "ssl_expiry", "ssl_invalid", "performance_degradation",
    "error_spike", "deploy_failure", "content_mismatch", "dns_failure",
  ]).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),
  status: mysqlEnum("status", [
    "open", "investigating", "repairing", "resolved", "ignored",
  ]).notNull().default("open"),

  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),

  // ── Timeline ──
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledgedAt"),
  resolvedAt: timestamp("resolvedAt"),
  resolutionNote: text("resolutionNote"),

  // ── Auto-Repair ──
  autoRepairAttempted: boolean("autoRepairAttempted").default(false).notNull(),
  autoRepairSucceeded: boolean("autoRepairSucceeded"),
  autoRepairAttempts: int("autoRepairAttempts").default(0).notNull(),

  // ── Metrics at time of incident ──
  triggerHttpStatus: int("triggerHttpStatus"),
  triggerResponseTimeMs: int("triggerResponseTimeMs"),
  triggerErrorMessage: text("triggerErrorMessage"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SiteIncident = typeof siteIncidents.$inferSelect;
export type InsertSiteIncident = typeof siteIncidents.$inferInsert;

/**
 * Repair logs — every auto-repair or manual repair action taken.
 */
export const repairLogs = mysqlTable("repair_logs", {
  id: int("id").autoincrement().primaryKey(),
  incidentId: int("incidentId"),
  siteId: int("siteId").notNull(),
  userId: int("userId").notNull(),

  action: mysqlEnum("action", [
    "restart_service", "redeploy", "rollback", "clear_cache",
    "fix_config", "ssl_renew", "dns_flush", "custom_command",
    "webhook_trigger", "platform_restart",
  ]).notNull(),
  method: mysqlEnum("method", ["api", "ssh", "login", "webhook", "platform"]).notNull(),
  status: mysqlEnum("status", ["pending", "running", "success", "failed", "cancelled"]).notNull().default("pending"),

  // ── Execution Details ──
  command: text("command"),                   // the command or API call made
  requestPayload: text("requestPayload"),     // what was sent
  responsePayload: text("responsePayload"),   // what came back
  output: text("output"),                     // stdout/stderr or response body
  errorMessage: text("errorMessage"),

  // ── Timing ──
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"),

  // ── Verification ──
  verificationCheckId: int("verificationCheckId"), // health_check that verified the repair
  siteHealthAfterRepair: mysqlEnum("siteHealthAfterRepair", ["healthy", "degraded", "down", "error"]),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type RepairLog = typeof repairLogs.$inferSelect;
export type InsertRepairLog = typeof repairLogs.$inferInsert;
