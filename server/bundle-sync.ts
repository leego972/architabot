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

  log.info("Bundle sync routes registered");
}
