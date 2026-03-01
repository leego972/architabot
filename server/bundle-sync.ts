/**
 * Bundle Sync — Serves the latest web client bundle for desktop app auto-sync.
 *
 * The desktop Electron app checks `/api/desktop/bundle-manifest` on startup and
 * periodically. If a newer version is available, it downloads the tarball from
 * `/api/desktop/bundle.tar.gz`, extracts it to `~/.archibald-titan/bundle/`,
 * and serves the updated frontend without requiring a full Electron rebuild.
 *
 * This means every `git push` → Railway deploy automatically updates all
 * desktop apps within 30 minutes (or on next launch).
 */

import { type Express, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createLogger } from "./_core/logger.js";

const log = createLogger("BundleSync");

// Cache the manifest so we don't recompute hash on every request
let cachedManifest: {
  version: string;
  hash: string;
  size: number;
  buildTime: string;
} | null = null;

let cachedTarball: Buffer | null = null;

/**
 * Compute SHA-256 hash of the entire dist/public directory contents.
 * We hash the index.html since it changes on every build (asset hashes embedded).
 */
function computeBundleHash(distPath: string): string {
  const indexPath = path.join(distPath, "index.html");
  if (!fs.existsSync(indexPath)) return "";
  const content = fs.readFileSync(indexPath);
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Get the app version from package.json
 */
function getAppVersion(): string {
  try {
    const pkgPath = path.resolve(
      process.env.NODE_ENV === "development"
        ? path.join(import.meta.dirname, "../../package.json")
        : path.join(import.meta.dirname, "../package.json")
    );
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Get the dist/public path (same logic as vite.ts serveStatic)
 */
function getDistPath(): string {
  return process.env.NODE_ENV === "development"
    ? path.resolve(import.meta.dirname, "../..", "dist", "public")
    : path.resolve(import.meta.dirname, "public");
}

/**
 * Build the manifest (cached after first call, invalidated if index.html changes)
 */
function getManifest() {
  const distPath = getDistPath();
  const indexPath = path.join(distPath, "index.html");

  if (!fs.existsSync(indexPath)) {
    return null;
  }

  const currentHash = computeBundleHash(distPath);

  // Return cached if hash hasn't changed
  if (cachedManifest && cachedManifest.hash === currentHash) {
    return cachedManifest;
  }

  const stat = fs.statSync(indexPath);

  cachedManifest = {
    version: getAppVersion(),
    hash: currentHash,
    size: 0, // Will be set when tarball is generated
    buildTime: stat.mtime.toISOString(),
  };

  // Invalidate tarball cache so it gets regenerated
  cachedTarball = null;

  log.info("Bundle manifest updated", {
    version: cachedManifest.version,
    hash: cachedManifest.hash,
  });

  return cachedManifest;
}

/**
 * Generate a tarball of the dist/public directory on-the-fly.
 * Uses Node.js built-in zlib + a simple tar implementation.
 * Cached in memory until the bundle hash changes.
 */
async function generateTarball(): Promise<Buffer | null> {
  if (cachedTarball) return cachedTarball;

  const distPath = getDistPath();
  if (!fs.existsSync(distPath)) return null;

  const { execSync } = await import("child_process");

  try {
    // Use system tar to create a gzipped tarball of the dist/public directory
    const tmpPath = path.join(
      process.env.TMPDIR || "/tmp",
      `titan-bundle-${Date.now()}.tar.gz`
    );

    execSync(`tar -czf "${tmpPath}" -C "${distPath}" .`, {
      timeout: 30000,
    });

    cachedTarball = fs.readFileSync(tmpPath);

    // Clean up temp file
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }

    // Update manifest with actual size
    if (cachedManifest) {
      cachedManifest.size = cachedTarball.length;
    }

    log.info("Bundle tarball generated", {
      size: `${(cachedTarball.length / 1024 / 1024).toFixed(1)}MB`,
    });

    return cachedTarball;
  } catch (err) {
    log.error("Failed to generate bundle tarball", {
      error: String(err),
    });
    return null;
  }
}

// ─── SSE: Real-time deploy notifications ───────────────────────────
// Desktop apps connect to this endpoint and receive instant notifications
// when a new deployment is detected (bundle hash changes).
const sseClients: Set<Response> = new Set();
let lastNotifiedHash: string | null = null;

/**
 * Check if the bundle has changed and notify all connected desktop clients.
 * Called on server startup and can be triggered by a deploy webhook.
 */
export function notifyDesktopClients() {
  const manifest = getManifest();
  if (!manifest) return;
  if (lastNotifiedHash === manifest.hash) return;
  lastNotifiedHash = manifest.hash;

  const payload = JSON.stringify({
    type: "bundle-updated",
    version: manifest.version,
    hash: manifest.hash,
    buildTime: manifest.buildTime,
  });

  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }

  log.info(`Notified ${sseClients.size} desktop clients of new bundle`, {
    version: manifest.version,
    hash: manifest.hash,
  });
}

// Periodically check for bundle changes (catches Railway deploys)
setInterval(() => {
  notifyDesktopClients();
}, 60_000); // Check every 60 seconds

export function registerBundleSyncRoutes(app: Express) {
  /**
   * GET /api/desktop/bundle-manifest
   * Returns the current bundle version, hash, size, and build time.
   * Desktop app checks this to decide whether to download a new bundle.
   */
  app.get("/api/desktop/bundle-manifest", (_req: Request, res: Response) => {
    const manifest = getManifest();
    if (!manifest) {
      return res.status(404).json({ error: "No bundle available" });
    }
    res.json(manifest);
  });

  /**
   * GET /api/desktop/bundle.tar.gz
   * Downloads the latest web client bundle as a gzipped tarball.
   * The desktop app extracts this to ~/.archibald-titan/bundle/ and
   * serves it as the frontend.
   */
  app.get(
    "/api/desktop/bundle.tar.gz",
    async (_req: Request, res: Response) => {
      try {
        const tarball = await generateTarball();
        if (!tarball) {
          return res.status(404).send("No bundle available");
        }

        const manifest = getManifest();
        res.set("Content-Type", "application/gzip");
        res.set("Content-Length", String(tarball.length));
        res.set(
          "Content-Disposition",
          `attachment; filename="titan-bundle-${manifest?.version || "latest"}.tar.gz"`
        );
        res.set("X-Bundle-Version", manifest?.version || "unknown");
        res.set("X-Bundle-Hash", manifest?.hash || "unknown");
        res.send(tarball);
      } catch (err) {
        log.error("Failed to serve bundle tarball", {
          error: String(err),
        });
        res.status(500).send("Failed to generate bundle");
      }
    }
  );

  /**
   * GET /api/desktop/bundle-stream
   * SSE endpoint for real-time deploy notifications.
   * Desktop apps connect here and receive instant updates when a new
   * deployment is detected, triggering immediate bundle sync.
   */
  app.get("/api/desktop/bundle-stream", (_req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Send initial connected event with current manifest
    const manifest = getManifest();
    res.write(
      `data: ${JSON.stringify({ type: "connected", version: manifest?.version, hash: manifest?.hash })}\n\n`
    );

    sseClients.add(res);
    log.info(`Desktop client connected to bundle stream (total: ${sseClients.size})`);

    // Keep-alive ping every 30 seconds
    const keepAlive = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 30_000);

    _req.on("close", () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
      log.info(`Desktop client disconnected from bundle stream (total: ${sseClients.size})`);
    });
  });

  /**
   * POST /api/desktop/notify-deploy
   * Webhook endpoint that can be called by CI/CD (Railway deploy hook)
   * to instantly notify all connected desktop apps of a new deployment.
   * Requires CRON_SECRET for authentication.
   */
  app.post("/api/desktop/notify-deploy", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Invalidate cached manifest and tarball to pick up new build
    cachedManifest = null;
    cachedTarball = null;

    // Notify all connected clients
    notifyDesktopClients();

    res.json({ success: true, clientsNotified: sseClients.size });
  });

  log.info("Bundle sync routes registered (with SSE stream and deploy webhook)");
}
