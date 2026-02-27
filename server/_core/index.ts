import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./serve-static";
import { registerStripeWebhook, processAllMonthlyRefills } from "../stripe-router";
import { registerDownloadRoute } from "../download-gate";
import { registerApiRoutes } from "../api-access-router";
import { registerV5ApiRoutes } from "../v5-features-router";
import { registerEmailAuthRoutes } from "../email-auth-router";
import { registerReleaseUploadRoute, registerUpdateFeedRoutes } from "../releases-router";
import { registerVoiceUploadRoute } from "../voice-router";
import { registerSocialAuthRoutes } from "../social-auth-router";
import { startScheduledDiscovery } from "../affiliate-discovery-engine";
import { startAdvertisingScheduler } from "../advertising-orchestrator";
import { registerBinancePayWebhook } from "../binance-pay-webhook";
import { registerSeoRoutes, startScheduledSeo } from "../seo-engine";
import { registerChatStreamRoutes } from "../chat-stream";
import { registerMarketplaceFileRoutes } from "../marketplace-files";
import { registerBundleSyncRoutes } from "../bundle-sync";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { csrfCookieMiddleware, csrfValidationMiddleware } from "./csrf";
import { correlationMiddleware } from "./correlation";
import { createLogger } from "./logger";
import { getErrorMessage } from "../_core/errors.js";

const log = createLogger('Startup');

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  // Trust proxy headers (Railway uses a single reverse proxy layer)
  // Use number 1 instead of true to prevent express-rate-limit ERR_ERL_PERMISSIVE_TRUST_PROXY
  app.set("trust proxy", 1);
  const server = createServer(app);

  // ── Security Headers ──────────────────────────────────────────
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
    // HSTS: enforce HTTPS for 1 year, include subdomains, allow preload submission
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    // Content-Security-Policy: restrict resource loading to trusted origins
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https: http:",
      "connect-src 'self' https://api.stripe.com https://*.google-analytics.com https://*.analytics.google.com https://files.manuscdn.com wss: ws:",
      "media-src 'self' https://files.manuscdn.com blob: data:",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
    ].join('; ');
    res.setHeader('Content-Security-Policy', csp);
    // Prevent DNS prefetch to third parties
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    // Prevent MIME type sniffing for downloads
    res.setHeader('X-Download-Options', 'noopen');
    // Prevent cross-origin embedder policy issues
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  });

  // ── Rate Limiting ─────────────────────────────────────────────
  // General API rate limit: 200 requests per minute per IP
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down and try again shortly.' },
    skip: (req: import('express').Request) => req.path === '/api/health',
  });
  app.use('/api/', apiLimiter);

  // Stricter limit for auth endpoints: 20 per minute per IP
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please wait a moment.' },
  });
  app.use('/api/auth/', authLimiter);
  app.use('/api/email-auth/', authLimiter);
  app.use('/api/social-auth/', authLimiter);

  // Chat streaming limit: 30 per minute per IP (prevents abuse of AI credits)
  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Chat rate limit reached. Please wait before sending more messages.' },
  });
  app.use('/api/chat/', chatLimiter);

  // Stripe checkout limit: 10 per minute per IP (prevents checkout abuse)
  const stripeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many checkout attempts. Please wait a moment.' },
  });
  app.use('/api/trpc/stripe.', stripeLimiter);

  // File upload limit: 20 per minute per IP
  const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many upload attempts. Please wait.' },
  });
  app.use('/api/chat/upload', uploadLimiter);
  app.use('/api/marketplace/upload', uploadLimiter);
  app.use('/api/releases/upload', uploadLimiter);

  // Download limit: 30 per minute per IP (prevents scraping)
  const downloadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Download rate limit reached. Please wait.' },
  });
  app.use('/api/download/', downloadLimiter);
  app.use('/api/desktop/bundle', downloadLimiter);

  // Stripe webhook MUST be registered BEFORE express.json() for raw body access
  registerStripeWebhook(app);
  // Binance Pay webhook (also before express.json for raw body)
  registerBinancePayWebhook(app);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ── Request Correlation IDs ───────────────────────────────────
  app.use(correlationMiddleware);

  // ── Cookie Parser & CSRF Protection ───────────────────────────
  app.use(cookieParser());
  app.use(csrfCookieMiddleware);
  app.use('/api/', csrfValidationMiddleware);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Email/password authentication endpoints
  registerEmailAuthRoutes(app);
  // Independent GitHub & Google OAuth (no Manus proxy)
  registerSocialAuthRoutes(app);
  // Health check endpoint (for Railway, load balancers, etc.)
  app.get('/api/health', async (_req, res) => {
    const health: Record<string, unknown> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    };
    // Check database connectivity
    try {
      const { getDb } = await import('../db.js');
      const db = await getDb();
      if (db) {
        const { sql } = await import('drizzle-orm');
        await db.execute(sql`SELECT 1`);
        health.database = 'connected';
      } else {
        health.database = 'unavailable';
        health.status = 'degraded';
      }
    } catch (dbErr: unknown) {
      health.database = 'error';
      health.status = 'degraded';
      health.dbError = getErrorMessage(dbErr);
    }
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  });
  // SEO routes (sitemap.xml, robots.txt, security.txt, RSS feed, structured data, redirects)
  registerSeoRoutes(app);
  // Token-gated download endpoint
  registerDownloadRoute(app);
  // REST API endpoints for API key access
  registerApiRoutes(app);
  // V5.0 expanded REST API with rate limiting and usage logging
  registerV5ApiRoutes(app);
  // Release binary upload endpoint (admin only)
  registerReleaseUploadRoute(app);
  // Auto-update feed for electron-updater (latest.yml endpoints)
  registerUpdateFeedRoutes(app);
  // Desktop bundle sync — serves latest web client for auto-sync
  registerBundleSyncRoutes(app);
  // Voice audio upload endpoint
  registerVoiceUploadRoute(app);
  // Marketplace file upload/download endpoints
  registerMarketplaceFileRoutes(app);
  // Chat SSE streaming and abort endpoints
  registerChatStreamRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    // Dynamic import: setupVite depends on 'vite' (devDependency) which is not
    // available in production. By using dynamic import here, esbuild won't
    // include vite.ts's setupVite branch in the production bundle.
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ── Global Error Handler (must be last middleware) ──
  // Catches unhandled errors from Express routes and prevents stack trace leakage
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error('Unhandled Express error', { error: err.message, stack: err.stack });
    const isProd = process.env.NODE_ENV === 'production';
    res.status(500).json({
      error: isProd ? 'Internal server error' : err.message,
      ...(isProd ? {} : { stack: err.stack }),
    });
  });

  // ─── Auto-migrate database on startup ──────────────────────────
  if (process.env.DATABASE_URL) {
    const pool = createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 2,
      connectTimeout: 30000,
    });
    // Step 1: Try Drizzle migrations (may fail if journal is out of sync)
    try {
      log.info('Running database migrations...');
      const migrationDb = drizzle(pool);
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const migrationsFolder = process.env.NODE_ENV === "production"
        ? path.resolve(__dirname, "..", "drizzle")
        : path.resolve(__dirname, "..", "..", "drizzle");
      log.debug('Migrations folder', { path: migrationsFolder });
      await migrate(migrationDb, { migrationsFolder });
      log.info('Database migrations completed');
    } catch (migErr: unknown) {
      log.warn('Drizzle migration warning (continuing with raw SQL)', { error: getErrorMessage(migErr)?.substring(0, 200) });
    }
    // Step 2: Always run raw SQL to ensure columns and tables exist (idempotent)
    try {

      // Safely add any missing columns that migrations may have missed
      const missingColumns = [
        // crowdfundingCampaigns columns
        "ALTER TABLE `crowdfundingCampaigns` ADD COLUMN `source` enum('internal','kickstarter','indiegogo','gofundme','other') DEFAULT 'internal' NOT NULL",
        "ALTER TABLE `crowdfundingCampaigns` ADD COLUMN `externalId` varchar(255)",
        "ALTER TABLE `crowdfundingCampaigns` ADD COLUMN `externalUrl` varchar(500)",
        "ALTER TABLE `crowdfundingCampaigns` ADD COLUMN `creatorName` varchar(255)",
        "ALTER TABLE `crowdfundingCampaigns` ADD COLUMN `location` varchar(255)",
        "ALTER TABLE `crowdfundingCampaigns` ADD COLUMN `percentFunded` int DEFAULT 0",
        "ALTER TABLE `crowdfundingCampaigns` ADD COLUMN `daysLeft` int",
        "ALTER TABLE `crowdfundingCampaigns` ADD COLUMN `subcategory` varchar(100)",
        "ALTER TABLE `crowdfundingCampaigns` ADD COLUMN `tags` json",
        "ALTER TABLE `crowdfundingCampaigns` ADD COLUMN `creatorAvatarUrl` varchar(500)",
        // CRITICAL: users table trial/marketing/payment columns (login loop fix)
        "ALTER TABLE `users` ADD COLUMN `marketingConsent` boolean NOT NULL DEFAULT true",
        "ALTER TABLE `users` ADD COLUMN `loginCount` int NOT NULL DEFAULT 0",
        "ALTER TABLE `users` ADD COLUMN `trialStartedAt` datetime NULL",
        "ALTER TABLE `users` ADD COLUMN `trialEndsAt` datetime NULL",
        "ALTER TABLE `users` ADD COLUMN `trialConvertedAt` datetime NULL",
        "ALTER TABLE `users` ADD COLUMN `hasPaymentMethod` boolean NOT NULL DEFAULT false",
        "ALTER TABLE `users` ADD COLUMN `stripeCustomerId` varchar(128) NULL",
        // seller_profiles subscription columns
        "ALTER TABLE `seller_profiles` ADD COLUMN `sellerSubscriptionActive` boolean NOT NULL DEFAULT false",
        "ALTER TABLE `seller_profiles` ADD COLUMN `sellerSubscriptionExpiresAt` datetime NULL",
        "ALTER TABLE `seller_profiles` ADD COLUMN `sellerSubscriptionPaidAt` datetime NULL",
        "ALTER TABLE `seller_profiles` ADD COLUMN `sellerSubscriptionStripeId` varchar(128) NULL",
        "ALTER TABLE `seller_profiles` ADD COLUMN `totalPlatformFeesPaid` int NOT NULL DEFAULT 0",
        // marketplace_listings anti-resale columns
        "ALTER TABLE `marketplace_listings` ADD COLUMN `fileHash` varchar(128) NULL",
        "ALTER TABLE `marketplace_listings` ADD COLUMN `originalListingId` int NULL",
      ];
      for (const sql of missingColumns) {
        try {
          await pool.promise().query(sql);
          log.debug('Added column', { column: sql.split('\`')[3] });
        } catch (e: unknown) {
          // Column already exists - ignore
          if (!getErrorMessage(e)?.includes('Duplicate column')) {
            log.warn('Column fix warning', { error: getErrorMessage(e) });
          }
        }
      }
      // Fix source column type if it was created as VARCHAR instead of ENUM
      try {
        await pool.promise().query(
          "ALTER TABLE `crowdfundingCampaigns` MODIFY COLUMN `source` enum('internal','kickstarter','indiegogo','gofundme','other') DEFAULT 'internal' NOT NULL"
        );
        log.debug('Ensured source column is ENUM type');
      } catch (e: unknown) {
        log.warn('Source column fix', { error: getErrorMessage(e)?.substring(0, 100) });
      }

      // Create marketplace tables if they don't exist
      const createTables = [
        `CREATE TABLE IF NOT EXISTS \`marketplace_listings\` (\`id\` int AUTO_INCREMENT NOT NULL, \`uid\` varchar(64) NOT NULL, \`sellerId\` int NOT NULL, \`title\` varchar(256) NOT NULL, \`slug\` varchar(300) NOT NULL, \`description\` text NOT NULL, \`longDescription\` text, \`category\` enum('agents','modules','blueprints','artifacts','exploits','templates','datasets','other') NOT NULL DEFAULT 'modules', \`riskCategory\` enum('safe','low_risk','medium_risk','high_risk') NOT NULL DEFAULT 'safe', \`reviewStatus\` enum('pending_review','approved','rejected','flagged') NOT NULL DEFAULT 'pending_review', \`reviewNotes\` text, \`status\` enum('draft','active','paused','sold_out','removed') NOT NULL DEFAULT 'draft', \`priceCredits\` int NOT NULL, \`priceUsd\` int NOT NULL DEFAULT 0, \`currency\` varchar(8) NOT NULL DEFAULT 'USD', \`fileUrl\` text, \`fileSize\` int, \`fileType\` varchar(64), \`previewUrl\` text, \`thumbnailUrl\` text, \`demoUrl\` text, \`tags\` text, \`language\` varchar(64), \`license\` varchar(64) DEFAULT 'MIT', \`version\` varchar(32) DEFAULT '1.0.0', \`totalSales\` int NOT NULL DEFAULT 0, \`totalRevenue\` int NOT NULL DEFAULT 0, \`viewCount\` int NOT NULL DEFAULT 0, \`downloadCount\` int NOT NULL DEFAULT 0, \`avgRating\` int NOT NULL DEFAULT 0, \`ratingCount\` int NOT NULL DEFAULT 0, \`featured\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`marketplace_listings_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`marketplace_listings_uid_unique\` UNIQUE(\`uid\`), CONSTRAINT \`marketplace_listings_slug_unique\` UNIQUE(\`slug\`))`,
        `CREATE TABLE IF NOT EXISTS \`marketplace_purchases\` (\`id\` int AUTO_INCREMENT NOT NULL, \`uid\` varchar(64) NOT NULL, \`buyerId\` int NOT NULL, \`listingId\` int NOT NULL, \`sellerId\` int NOT NULL, \`priceCredits\` int NOT NULL, \`priceUsd\` int NOT NULL DEFAULT 0, \`status\` enum('completed','refunded','disputed') NOT NULL DEFAULT 'completed', \`downloadCount\` int NOT NULL DEFAULT 0, \`maxDownloads\` int NOT NULL DEFAULT 5, \`downloadToken\` varchar(128), \`hasReviewed\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT (now()), CONSTRAINT \`marketplace_purchases_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`marketplace_purchases_uid_unique\` UNIQUE(\`uid\`))`,
        `CREATE TABLE IF NOT EXISTS \`marketplace_reviews\` (\`id\` int AUTO_INCREMENT NOT NULL, \`listingId\` int NOT NULL, \`purchaseId\` int NOT NULL, \`reviewerId\` int NOT NULL, \`rating\` int NOT NULL, \`title\` varchar(256), \`comment\` text, \`sellerRating\` int, \`helpful\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`marketplace_reviews_id\` PRIMARY KEY(\`id\`))`,
        `CREATE TABLE IF NOT EXISTS \`seller_profiles\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`displayName\` varchar(128) NOT NULL, \`bio\` text, \`avatarUrl\` text, \`totalSales\` int NOT NULL DEFAULT 0, \`totalRevenue\` int NOT NULL DEFAULT 0, \`avgRating\` int NOT NULL DEFAULT 0, \`ratingCount\` int NOT NULL DEFAULT 0, \`verified\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`seller_profiles_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`seller_profiles_userId_unique\` UNIQUE(\`userId\`))`,
        `CREATE TABLE IF NOT EXISTS \`crypto_payments\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int, \`campaignId\` int NOT NULL, \`contributionId\` int, \`merchantTradeNo\` varchar(64) NOT NULL, \`binancePrepayId\` varchar(128), \`status\` varchar(32) NOT NULL DEFAULT 'pending', \`fiatAmount\` varchar(32) NOT NULL, \`fiatCurrency\` varchar(8) NOT NULL DEFAULT 'USD', \`cryptoCurrency\` varchar(16), \`cryptoAmount\` varchar(64), \`platformFee\` varchar(32) NOT NULL DEFAULT '0', \`creatorAmount\` varchar(32) NOT NULL DEFAULT '0', \`checkoutUrl\` text, \`qrcodeLink\` text, \`donorName\` varchar(128), \`donorEmail\` varchar(256), \`donorMessage\` text, \`webhookData\` text, \`paidAt\` timestamp, \`expiresAt\` timestamp, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`crypto_payments_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`crypto_payments_merchantTradeNo_unique\` UNIQUE(\`merchantTradeNo\`))`,
        `CREATE TABLE IF NOT EXISTS \`seller_payout_methods\` (\`id\` int AUTO_INCREMENT NOT NULL, \`sellerId\` int NOT NULL, \`userId\` int NOT NULL, \`methodType\` enum('bank_transfer','paypal','stripe_connect') NOT NULL, \`isDefault\` boolean NOT NULL DEFAULT false, \`bankBsb\` varchar(16), \`bankAccountNumber\` varchar(32), \`bankAccountName\` varchar(128), \`bankName\` varchar(128), \`bankCountry\` varchar(64), \`bankSwiftBic\` varchar(16), \`paypalEmail\` varchar(320), \`stripeConnectAccountId\` varchar(128), \`stripeConnectOnboarded\` boolean NOT NULL DEFAULT false, \`verified\` boolean NOT NULL DEFAULT false, \`status\` enum('active','pending_verification','disabled') NOT NULL DEFAULT 'pending_verification', \`label\` varchar(128), \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`seller_payout_methods_id\` PRIMARY KEY(\`id\`))`,
        `CREATE TABLE IF NOT EXISTS \`platform_revenue\` (\`id\` int AUTO_INCREMENT NOT NULL, \`source\` varchar(64) NOT NULL, \`sourceId\` varchar(128), \`type\` varchar(64) NOT NULL, \`amount\` varchar(32) NOT NULL, \`currency\` varchar(8) NOT NULL DEFAULT 'USD', \`description\` text, \`metadata\` text, \`createdAt\` timestamp NOT NULL DEFAULT (now()), CONSTRAINT \`platform_revenue_id\` PRIMARY KEY(\`id\`))`,
      ];
      for (const ddl of createTables) {
        try {
          await pool.promise().query(ddl);
        } catch (e: unknown) {
          log.warn('Table creation warning', { error: getErrorMessage(e)?.substring(0, 100) });
        }
      }
      log.info('All tables ensured');
    } catch (err: unknown) {
      log.error('Raw SQL migration failed', { error: getErrorMessage(err) });
    }
    // Always close the migration pool
    try { await pool.promise().end(); } catch (_) {}
  } else {
    log.warn('No DATABASE_URL - skipping migrations');
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    log.info(`Port ${preferredPort} busy, using ${port} instead`);
  }

  // Set server timeout to 10 minutes for long builder tasks
  server.timeout = 600_000; // 10 minutes
  server.keepAliveTimeout = 620_000; // slightly longer than timeout
  server.headersTimeout = 630_000; // slightly longer than keepAlive

  server.listen(port, () => {
    log.info(`Server running on http://localhost:${port}/`);

    // ─── Scheduled Monthly Credit Refill ──────────────────────────
    // Run once on startup (catches any missed refills) and then every 24 hours.
    // The processMonthlyRefill function is idempotent — it checks lastRefillAt
    // and only refills if the user hasn't been refilled this calendar month.
    scheduleMonthlyRefill();

       // ─── Auto-Promote Owner to Admin ────────────────────────
    // Ensures the platform owner always has admin role, even if
    // they registered before the auto-promotion logic was added.
    setTimeout(async () => {
      try {
        const { getDb } = await import("../db.js");
        const { users } = await import("../../drizzle/schema.js");
        const { eq, or } = await import("drizzle-orm");
        const { ENV } = await import("./env.js");
        const db = await getDb();
        if (!db) return;

        // Promote user ID 1 (first user) to admin
        await db.update(users).set({ role: "admin" }).where(
          eq(users.id, 1)
        ).catch(() => {});

        // Promote by OWNER_EMAILS list
        if (ENV.ownerEmails && ENV.ownerEmails.length > 0) {
          const { inArray } = await import("drizzle-orm");
          await db.update(users).set({ role: "admin" }).where(
            inArray(users.email, ENV.ownerEmails)
          ).catch(() => {});
          log.info('Admin auto-promotion', { emails: ENV.ownerEmails });
        }

        // Promote by OWNER_OPEN_ID
        if (ENV.ownerOpenId) {
          await db.update(users).set({ role: "admin" }).where(
            eq(users.openId, ENV.ownerOpenId)
          ).catch(() => {});
        }
      } catch (err) {
        log.error('Admin auto-promotion failed', { error: String(err) });
      }
    }, 3000);

    // ─── Auto-seed Affiliate Programs ──────────────────────
    // Seeds known affiliate programs on startup if not already presentt
    setTimeout(async () => {
      try {
        const { seedAffiliatePrograms } = await import("../affiliate-engine.js");
        const count = await seedAffiliatePrograms();
        if (count > 0) log.info(`Auto-seeded ${count} affiliate programs`);
        else log.debug('Affiliate programs already seeded');
      } catch (err) {
        log.error('Affiliate seed failed', { error: String(err) });
      }
    }, 5000);

    // ─── Auto-seed Releases ──────────────────────────────────
    // Seeds the initial release with platform binaries if DB is empty
    setTimeout(async () => {
      try {
        const { getDb } = await import("../db.js");
        const { releases } = await import("../../drizzle/schema.js");
        const { sql } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) { log.warn('Release seed skipped: DB not available'); return; }
        const existing = await db.select({ count: sql<number>`count(*)` }).from(releases);
        if (existing[0].count === 0) {
          await db.insert(releases).values({
            version: "8.1.0",
            title: "Archibald Titan v8.1.0",
            changelog: "**Archibald Titan v8.1.0 — Latest Release**\n\n" +
              "All features from v1.0 through v8.1 included:\n\n" +
              "- 15+ Provider Automation with stealth browser\n" +
              "- AES-256-GCM Encrypted Vault\n" +
              "- CAPTCHA Solving (reCAPTCHA, hCaptcha)\n" +
              "- Residential Proxy Pool with auto-rotation\n" +
              "- Kill Switch with emergency shutdown\n" +
              "- Credential Expiry Watchdog\n" +
              "- Bulk Provider Sync & Credential Diff/History\n" +
              "- Scheduled Auto-Sync & Smart Fetch\n" +
              "- Provider Health Trends\n" +
              "- Credential Leak Scanner\n" +
              "- One-Click Provider Onboarding\n" +
              "- Team Credential Vault\n" +
              "- Developer REST API & Webhooks\n" +
              "- Email/Password Authentication\n" +
              "- Credit Membership System\n" +
              "- Autonomous Advertising & Marketing Engine\n" +
              "- Contextual Affiliate Recommendations\n" +
              "- Tech Bazaar Marketplace with dual payment (Credits + Stripe)\n" +
              "- Seller Payout System (Bank, PayPal, Stripe Connect)\n" +
              "- AI-Powered Code Builder with Sandbox\n" +
              "- Website Replicator & Domain Search\n" +
              "- SEO Engine with IndexNow & Structured Data\n" +
              "- Blog CMS with AI Generation",
            downloadUrlWindows: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663339631904/AlISTsCQSdQTgAut.exe",
            downloadUrlMac: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663339631904/hHpsXgJtQRLZdDOK.zip",
            downloadUrlLinux: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663339631904/aelqItiquyVUiorf.AppImage",
            fileSizeMb: 185,
            isLatest: 1,
            isPrerelease: 0,
            downloadCount: 0,
          });
          log.info('Auto-seeded v8.1.0 release');
        } else {
          log.debug(`Releases already exist (${existing[0].count} found)`);
        }
      } catch (err) {
        log.error('Release seed failed', { error: String(err) });
      }
    }, 6000);

    // ─── Auto-seed Blog Posts ──────────────────────────────────
    // Seeds SEO blog posts on startup if not already present
    setTimeout(async () => {
      try {
        const { seedBlogPosts } = await import("../blog-seed.js");
        const count = await seedBlogPosts();
        if (count > 0) log.info(`Auto-seeded ${count} blog posts`);
        else log.debug('Blog posts already seeded');
      } catch (err) {
        log.error('Blog seed failed', { error: String(err) });
      }
    }, 8000);

    // ─── Autonomous Affiliate Discovery ──────────────────────────
    // Runs every Wednesday and Saturday at 6 AM UTC
    // Discovers new affiliate programs, scores them, generates applications
    startScheduledDiscovery();

    // ─── Autonomous SEO Optimization ──────────────────────────────
    // Runs weekly: meta tag analysis, keyword research, health scoring
    startScheduledSeo();

    // ─── Autonomous Advertising Orchestrator ──────────────────────
    // Runs daily: blog generation, social media, community engagement,
    // email nurture, backlink outreach, affiliate optimization, SEO
    startAdvertisingScheduler();
  });
}

function scheduleMonthlyRefill() {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  // Run after a short delay on startup to let DB connections settle
  setTimeout(async () => {
    try {
      log.info('Running startup credit refill check...');
      const result = await processAllMonthlyRefills();
      log.info('Startup refill complete', { processed: result.processed, refilled: result.refilled, errors: result.errors });
    } catch (err: unknown) {
      log.error('Startup refill failed', { error: getErrorMessage(err) });
    }
  }, 30_000); // 30 second delay — give DB connections time to settle

  // Then run every 24 hours
  setInterval(async () => {
    try {
      log.info('Running scheduled credit refill...');
      const result = await processAllMonthlyRefills();
      log.info('Scheduled refill complete', { processed: result.processed, refilled: result.refilled, errors: result.errors });
    } catch (err: unknown) {
      log.error('Scheduled refill failed', { error: getErrorMessage(err) });
    }
  }, TWENTY_FOUR_HOURS);
}

startServer().catch((err) => log.error('Server startup failed', { error: String(err) }));

// ─── Graceful Shutdown ──────────────────────────────────────────
let isShuttingDown = false;

function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log.info(`Received ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  // The server reference is inside startServer scope, so we use process.exit
  // with a timeout to allow in-flight requests to complete
  const SHUTDOWN_TIMEOUT = 15_000; // 15 seconds max

  const forceExit = setTimeout(() => {
    log.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  // Unref so the timer doesn't keep the process alive if everything closes cleanly
  forceExit.unref();

  // Give in-flight requests time to finish
  setTimeout(() => {
    log.info('Graceful shutdown complete.');
    process.exit(0);
  }, 3000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Catch unhandled rejections and uncaught exceptions
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection', { error: String(reason) });
});

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception', { error: err.message, stack: err.stack });
  // Exit after logging — the process is in an undefined state
  process.exit(1);
});
