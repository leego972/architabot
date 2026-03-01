import { z } from "zod";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { releases } from "../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";
import { storagePut } from "./storage";
import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "../shared/const";
import { sdk } from "./_core/sdk";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
const log = createLogger("ReleasesRouter");

// ─── Default seed release (shown when DB has no releases) ───────────

const SEED_RELEASE = {
  id: 0,
  version: "1.0.0-beta",
  title: "Archibald Titan v1.0.0 Beta",
  changelog:
    "Initial beta release of Archibald Titan AI.\n\n" +
    "**New Features:**\n" +
    "- Autonomous credential retrieval from 15+ providers\n" +
    "- AES-256-GCM encrypted vault — keys never stored in plaintext\n" +
    "- Stealth Playwright browser with device fingerprinting\n" +
    "- Integrated CAPTCHA solving (reCAPTCHA, hCaptcha, image)\n" +
    "- Residential proxy pool with automatic rotation\n" +
    "- Kill switch with emergency shutdown code\n" +
    "- Export credentials as JSON, CSV, or .env\n\n" +
    "**Security:**\n" +
    "- All credentials encrypted at rest with AES-256-GCM\n" +
    "- Session-based authentication via Manus OAuth\n" +
    "- Proxy credentials encrypted separately\n" +
    "- Kill switch for instant emergency shutdown",
  fileSizeMb: 185,
  isLatest: 1,
  isPrerelease: 1,
  downloadCount: 0,
  // Platform availability flags — tells frontend which platforms have downloads
  hasWindows: false,
  hasMac: false,
  hasLinux: false,
  publishedAt: new Date(),
  createdAt: new Date(),
};

/**
 * Strip raw download URLs from a release object.
 * The frontend never sees the actual URLs — downloads go through the token-gated endpoint.
 */
function sanitizeRelease(release: any) {
  return {
    id: release.id,
    version: release.version,
    title: release.title,
    changelog: release.changelog,
    fileSizeMb: release.fileSizeMb,
    isLatest: release.isLatest,
    isPrerelease: release.isPrerelease,
    downloadCount: release.downloadCount,
    hasWindows: !!release.downloadUrlWindows,
    hasMac: !!release.downloadUrlMac,
    hasLinux: !!release.downloadUrlLinux,
    publishedAt: release.publishedAt,
    createdAt: release.createdAt,
  };
}

// ─── Router ─────────────────────────────────────────────────────────

export const releasesRouter = router({
  /** Get the latest stable release (public — URLs stripped) */
  latest: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return SEED_RELEASE;

    const [release] = await db
      .select()
      .from(releases)
      .where(eq(releases.isLatest, 1))
      .limit(1);

    return release ? sanitizeRelease(release) : SEED_RELEASE;
  }),

  /** Get all releases for changelog (public — URLs stripped) */
  list: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [SEED_RELEASE];

    const allReleases = await db
      .select()
      .from(releases)
      .orderBy(desc(releases.publishedAt))
      .limit(20);

    return allReleases.length > 0
      ? allReleases.map(sanitizeRelease)
      : [SEED_RELEASE];
  }),

  /** Check for updates — compare client version against latest (public) */
  checkUpdate: publicProcedure
    .input(z.object({ currentVersion: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return {
          updateAvailable: false,
          currentVersion: input.currentVersion,
          latestVersion: input.currentVersion,
        };
      }

      const [latest] = await db
        .select()
        .from(releases)
        .where(eq(releases.isLatest, 1))
        .limit(1);

      if (!latest) {
        return {
          updateAvailable: false,
          currentVersion: input.currentVersion,
          latestVersion: input.currentVersion,
        };
      }

      const isNewer = compareVersions(latest.version, input.currentVersion) > 0;
      return {
        updateAvailable: isNewer,
        currentVersion: input.currentVersion,
        latestVersion: latest.version,
        release: isNewer ? sanitizeRelease(latest) : undefined,
      };
    }),

  // ─── Admin Endpoints ──────────────────────────────────────────────

  /** Create a new release (admin only) */
  create: protectedProcedure
    .input(
      z.object({
        version: z.string().min(1),
        title: z.string().min(1),
        changelog: z.string().min(1),
        downloadUrlWindows: z.string().nullable().optional(),
        downloadUrlMac: z.string().nullable().optional(),
        downloadUrlLinux: z.string().nullable().optional(),
        fileSizeMb: z.number().nullable().optional(),
        isPrerelease: z.boolean().optional(),
        setAsLatest: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      if (input.setAsLatest) {
        await db.update(releases).set({ isLatest: 0 }).where(eq(releases.isLatest, 1));
      }

      const [result] = await db.insert(releases).values({
        version: input.version,
        title: input.title,
        changelog: input.changelog,
        downloadUrlWindows: input.downloadUrlWindows ?? null,
        downloadUrlMac: input.downloadUrlMac ?? null,
        downloadUrlLinux: input.downloadUrlLinux ?? null,
        fileSizeMb: input.fileSizeMb ?? null,
        isPrerelease: input.isPrerelease ? 1 : 0,
        isLatest: input.setAsLatest ? 1 : 0,
      });

      return { id: result.insertId };
    }),

  /** Update a release (admin only) */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        version: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        changelog: z.string().min(1).optional(),
        downloadUrlWindows: z.string().nullable().optional(),
        downloadUrlMac: z.string().nullable().optional(),
        downloadUrlLinux: z.string().nullable().optional(),
        fileSizeMb: z.number().nullable().optional(),
        isPrerelease: z.boolean().optional(),
        setAsLatest: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { id, setAsLatest, isPrerelease, ...rest } = input;

      if (setAsLatest) {
        await db.update(releases).set({ isLatest: 0 }).where(eq(releases.isLatest, 1));
      }

      const updateData: any = { ...rest };
      if (setAsLatest !== undefined) updateData.isLatest = setAsLatest ? 1 : 0;
      if (isPrerelease !== undefined) updateData.isPrerelease = isPrerelease ? 1 : 0;

      await db.update(releases).set(updateData).where(eq(releases.id, id));
      return { success: true };
    }),

  /** Delete a release (admin only) */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.delete(releases).where(eq(releases.id, input.id));
      return { success: true };
    }),

  /** Admin: get full release list with download URLs visible */
  adminList: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }

    const db = await getDb();
    if (!db) return [];

    return db
      .select()
      .from(releases)
      .orderBy(desc(releases.publishedAt))
      .limit(50);
  }),

  /**
   * Sync releases from GitHub.
   * Fetches the latest release from GitHub API and upserts it into the database.
   * Public endpoint — can be called by anyone (e.g., webhook, cron, or on page load).
   * Rate-limited by GitHub API (60 req/hr unauthenticated).
   */
  syncFromGitHub: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const GITHUB_OWNER = "leego972";
    const GITHUB_REPO = "archibald-titan-ai";
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "ArchibaldTitan",
    };
    // Use PAT if available for higher rate limits
    const pat = process.env.GITHUB_PAT;
    if (pat) headers.Authorization = `token ${pat}`;

    try {
      // Fetch all releases from GitHub (up to 30)
      const ghRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=30`,
        { headers }
      );
      if (!ghRes.ok) {
        const errText = await ghRes.text();
        log.error("[GitHub Sync] Failed to fetch releases", { status: ghRes.status, body: errText });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `GitHub API error: ${ghRes.status}` });
      }

      const ghReleases = (await ghRes.json()) as Array<{
        tag_name: string;
        name: string;
        body: string;
        prerelease: boolean;
        published_at: string;
        draft: boolean;
      }>;

      if (!ghReleases.length) {
        return { synced: 0, message: "No releases found on GitHub" };
      }

      let synced = 0;
      let latestVersion = "";

      // Find the latest non-draft, non-prerelease version
      const latestStable = ghReleases.find((r) => !r.draft && !r.prerelease);
      if (latestStable) {
        latestVersion = latestStable.tag_name.replace(/^v/, "");
      }

      for (const ghRelease of ghReleases) {
        if (ghRelease.draft) continue; // Skip drafts

        const version = ghRelease.tag_name.replace(/^v/, "");
        const title = ghRelease.name || `v${version}`;
        const changelog = ghRelease.body || "No changelog provided.";
        const isPrerelease = ghRelease.prerelease ? 1 : 0;
        const isLatest = version === latestVersion ? 1 : 0;

        // Check if this version already exists
        const [existing] = await db
          .select()
          .from(releases)
          .where(eq(releases.version, version))
          .limit(1);

        if (existing) {
          // Update existing release
          await db.update(releases).set({
            title,
            changelog,
            isPrerelease,
            isLatest,
            publishedAt: new Date(ghRelease.published_at),
          }).where(eq(releases.id, existing.id));
        } else {
          // Insert new release
          // First, clear isLatest from all other releases if this is the latest
          if (isLatest) {
            await db.update(releases).set({ isLatest: 0 }).where(eq(releases.isLatest, 1));
          }
          await db.insert(releases).values({
            version,
            title,
            changelog,
            isPrerelease,
            isLatest,
            publishedAt: new Date(ghRelease.published_at),
          });
        }
        synced++;
      }

      log.info(`[GitHub Sync] Synced ${synced} releases from GitHub, latest: v${latestVersion}`);
      return { synced, latestVersion, message: `Synced ${synced} releases from GitHub` };
    } catch (err: unknown) {
      if (err instanceof TRPCError) throw err;
      log.error("[GitHub Sync] Error", { error: String(err) });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: getErrorMessage(err) || "GitHub sync failed" });
    }
  }),
});

// ─── Express Route: Binary Upload ──────────────────────────────────
// Admin-only Express route for multipart file uploads to S3

const ALLOWED_EXTENSIONS: Record<string, string> = {
  ".exe": "application/octet-stream",
  ".msi": "application/octet-stream",
  ".dmg": "application/octet-stream",
  ".pkg": "application/octet-stream",
  ".appimage": "application/octet-stream",
  ".deb": "application/octet-stream",
  ".rpm": "application/octet-stream",
  ".tar.gz": "application/gzip",
  ".zip": "application/zip",
};

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

// ─── Auto-Update Feed Endpoints ──────────────────────────────────
// Serves latest.yml / latest-linux.yml / latest-mac.yml for electron-updater

function generateUpdateYml(release: any, platform: "windows" | "mac" | "linux"): string {
  const urlMap = {
    windows: release.downloadUrlWindows,
    mac: release.downloadUrlMac,
    linux: release.downloadUrlLinux,
  };
  const sha512Map = {
    windows: release.sha512Windows,
    mac: release.sha512Mac,
    linux: release.sha512Linux,
  };
  const sizeMap = {
    windows: release.fileSizeWindows,
    mac: release.fileSizeMac,
    linux: release.fileSizeLinux,
  };

  const url = urlMap[platform];
  const sha512 = sha512Map[platform];
  const size = sizeMap[platform];

  if (!url) return "";

  // Extract filename from URL
  const fileName = url.split("/").pop() || "update";
  const releaseDate = release.publishedAt instanceof Date
    ? release.publishedAt.toISOString()
    : new Date(release.publishedAt).toISOString();

  let yml = `version: ${release.version}\n`;
  yml += `files:\n`;
  yml += `  - url: ${url}\n`;
  if (sha512) yml += `    sha512: ${sha512}\n`;
  if (size) yml += `    size: ${size}\n`;
  yml += `path: ${url}\n`;
  if (sha512) yml += `sha512: ${sha512}\n`;
  yml += `releaseDate: '${releaseDate}'\n`;
  if (release.title) yml += `releaseName: '${release.title}'\n`;
  if (release.changelog) {
    yml += `releaseNotes: |\n`;
    release.changelog.split("\n").forEach((line: string) => {
      yml += `  ${line}\n`;
    });
  }

  return yml;
}

export function registerUpdateFeedRoutes(app: Express) {
  // Windows: latest.yml
  app.get("/api/desktop/update/latest.yml", async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) return res.status(404).send("No releases available");
      const [latest] = await db.select().from(releases).where(eq(releases.isLatest, 1)).limit(1);
      if (!latest || !latest.downloadUrlWindows) return res.status(404).send("No Windows release available");
      const yml = generateUpdateYml(latest, "windows");
      res.set("Content-Type", "text/yaml");
      res.send(yml);
    } catch (err: unknown) {
      log.error("[Update Feed] Error:", { error: String(getErrorMessage(err)) });
      res.status(500).send("Internal error");
    }
  });

  // Linux: latest-linux.yml
  app.get("/api/desktop/update/latest-linux.yml", async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) return res.status(404).send("No releases available");
      const [latest] = await db.select().from(releases).where(eq(releases.isLatest, 1)).limit(1);
      if (!latest || !latest.downloadUrlLinux) return res.status(404).send("No Linux release available");
      const yml = generateUpdateYml(latest, "linux");
      res.set("Content-Type", "text/yaml");
      res.send(yml);
    } catch (err: unknown) {
      log.error("[Update Feed] Error:", { error: String(getErrorMessage(err)) });
      res.status(500).send("Internal error");
    }
  });

  // macOS: latest-mac.yml
  app.get("/api/desktop/update/latest-mac.yml", async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) return res.status(404).send("No releases available");
      const [latest] = await db.select().from(releases).where(eq(releases.isLatest, 1)).limit(1);
      if (!latest || !latest.downloadUrlMac) return res.status(404).send("No macOS release available");
      const yml = generateUpdateYml(latest, "mac");
      res.set("Content-Type", "text/yaml");
      res.send(yml);
    } catch (err: unknown) {
      log.error("[Update Feed] Error:", { error: String(getErrorMessage(err)) });
      res.status(500).send("Internal error");
    }
  });
}

// ─── GitHub Webhook / Manual Sync Endpoint ──────────────────────
// POST /api/releases/sync-github — triggers a sync from GitHub releases
// Can be used as a GitHub webhook or called manually
export function registerGitHubSyncRoute(app: Express) {
  app.post("/api/releases/sync-github", async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const GITHUB_OWNER = "leego972";
      const GITHUB_REPO = "archibald-titan-ai";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "ArchibaldTitan",
      };
      const pat = process.env.GITHUB_PAT;
      if (pat) headers.Authorization = `token ${pat}`;

      const ghRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=30`,
        { headers }
      );
      if (!ghRes.ok) {
        return res.status(502).json({ error: `GitHub API error: ${ghRes.status}` });
      }

      const ghReleases = (await ghRes.json()) as any[];
      const latestStable = ghReleases.find((r: any) => !r.draft && !r.prerelease);
      const latestVersion = latestStable ? latestStable.tag_name.replace(/^v/, "") : "";
      let synced = 0;

      for (const ghRelease of ghReleases) {
        if (ghRelease.draft) continue;
        const version = ghRelease.tag_name.replace(/^v/, "");
        const title = ghRelease.name || `v${version}`;
        const changelog = ghRelease.body || "No changelog provided.";
        const isPrerelease = ghRelease.prerelease ? 1 : 0;
        const isLatest = version === latestVersion ? 1 : 0;

        const [existing] = await db.select().from(releases).where(eq(releases.version, version)).limit(1);
        if (existing) {
          await db.update(releases).set({ title, changelog, isPrerelease, isLatest, publishedAt: new Date(ghRelease.published_at) }).where(eq(releases.id, existing.id));
        } else {
          if (isLatest) await db.update(releases).set({ isLatest: 0 }).where(eq(releases.isLatest, 1));
          await db.insert(releases).values({ version, title, changelog, isPrerelease, isLatest, publishedAt: new Date(ghRelease.published_at) });
        }
        synced++;
      }

      log.info(`[GitHub Webhook Sync] Synced ${synced} releases, latest: v${latestVersion}`);
      return res.json({ synced, latestVersion });
    } catch (err: unknown) {
      log.error("[GitHub Webhook Sync] Error", { error: String(err) });
      return res.status(500).json({ error: getErrorMessage(err) || "Sync failed" });
    }
  });
}

export function registerReleaseUploadRoute(app: Express) {
  // Multer-free: read raw body chunks for large binary uploads
  app.post("/api/releases/upload", async (req: Request, res: Response) => {
    try {
      // Auth check
      let user: any;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Parse multipart — use a simple approach with raw body
      const contentType = req.headers["content-type"] ?? "";
      if (!contentType.includes("multipart/form-data")) {
        return res.status(400).json({ error: "Content-Type must be multipart/form-data" });
      }

      // We need to use a lightweight multipart parser
      // Since express.json() is already applied, we need busboy for multipart
      const { default: Busboy } = await import("busboy");
      const busboy = Busboy({
        headers: req.headers,
        limits: { fileSize: MAX_FILE_SIZE, files: 1 },
      });

      let platform = "";
      let releaseId = 0;
      let fileBuffer: Buffer | null = null;
      let fileName = "";
      let fileMimeType = "";

      const result = await new Promise<{
        platform: string;
        releaseId: number;
        fileBuffer: Buffer;
        fileName: string;
      }>((resolve, reject) => {
        const chunks: Buffer[] = [];

        busboy.on("field", (name: string, val: string) => {
          if (name === "platform") platform = val;
          if (name === "releaseId") releaseId = parseInt(val, 10);
        });

        busboy.on("file", (_fieldname: string, stream: any, info: any) => {
          fileName = info.filename;
          fileMimeType = info.mimeType;
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            fileBuffer = Buffer.concat(chunks);
          });
        });

        busboy.on("finish", () => {
          if (!fileBuffer || !platform || !releaseId) {
            reject(new Error("Missing required fields: file, platform, releaseId"));
          } else {
            resolve({ platform, releaseId, fileBuffer, fileName });
          }
        });

        busboy.on("error", reject);
        req.pipe(busboy);
      });

      // Validate platform
      if (!["windows", "mac", "linux"].includes(result.platform)) {
        return res.status(400).json({ error: "Platform must be windows, mac, or linux" });
      }

      // Validate file extension
      const ext = result.fileName.toLowerCase().match(/\.(exe|msi|dmg|pkg|appimage|deb|rpm|tar\.gz|zip)$/)?.[0];
      if (!ext) {
        return res.status(400).json({
          error: `Invalid file type. Allowed: ${Object.keys(ALLOWED_EXTENSIONS).join(", ")}`,
        });
      }

      // Upload to S3
      const hash = crypto.randomBytes(8).toString("hex");
      const s3Key = `releases/${result.releaseId}/${result.platform}/${hash}-${result.fileName}`;
      const { url } = await storagePut(s3Key, result.fileBuffer, ALLOWED_EXTENSIONS[ext] || "application/octet-stream");

      // Update the release record with the download URL
      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: "Database unavailable" });
      }

      const urlField =
        result.platform === "windows" ? "downloadUrlWindows" :
        result.platform === "mac" ? "downloadUrlMac" : "downloadUrlLinux";

      await db
        .update(releases)
        .set({
          [urlField]: url,
          fileSizeMb: Math.round(result.fileBuffer.length / (1024 * 1024)),
        })
        .where(eq(releases.id, result.releaseId));

      return res.json({
        success: true,
        platform: result.platform,
        fileName: result.fileName,
        fileSizeMb: Math.round(result.fileBuffer.length / (1024 * 1024)),
        url,
      });
    } catch (err: unknown) {
      log.error("[Release Upload Error]", { error: String(err) });
      return res.status(500).json({ error: getErrorMessage(err) || "Upload failed" });
    }
  });
}

// ─── Helpers ────────────────────────────────────────────────────────

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/[^0-9.]/g, "").split(".").map(Number);
  const pb = b.replace(/[^0-9.]/g, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  const aIsPre = a.includes("-");
  const bIsPre = b.includes("-");
  if (aIsPre && !bIsPre) return -1;
  if (!aIsPre && bIsPre) return 1;
  return 0;
}
