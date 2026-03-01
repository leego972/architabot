/**
 * Marketplace File Delivery System
 * - POST /api/marketplace/upload — Seller uploads a ZIP/file for their listing
 * - GET  /api/marketplace/download/:token — Buyer downloads with purchase token
 */

import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { storagePut, storageGet } from "./storage";
import * as db from "./db";
import crypto from "crypto";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
import { scanFileForMalware, trackIncident } from "./security-fortress";
const log = createLogger("MarketplaceFiles");

// Max file size: 100MB
const MAX_MARKETPLACE_FILE_SIZE = 100 * 1024 * 1024;

// Allowed file extensions for marketplace uploads
const ALLOWED_EXTENSIONS: Record<string, string> = {
  ".zip": "application/zip",
  ".tar.gz": "application/gzip",
  ".tgz": "application/gzip",
  ".gz": "application/gzip",
  ".js": "application/javascript",
  ".ts": "text/typescript",
  ".py": "text/x-python",
  ".json": "application/json",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
};

export function registerMarketplaceFileRoutes(app: Express) {
  // ─── UPLOAD: Seller uploads file for their listing ───────────────
  app.post("/api/marketplace/upload", async (req: Request, res: Response) => {
    try {
      // Auth check
      let user: any;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        return res.status(401).json({ error: "Authentication required" });
      }

      const contentType = req.headers["content-type"] ?? "";
      if (!contentType.includes("multipart/form-data")) {
        return res.status(400).json({ error: "Content-Type must be multipart/form-data" });
      }

      const { default: Busboy } = await import("busboy");
      const busboy = Busboy({
        headers: req.headers,
        limits: { fileSize: MAX_MARKETPLACE_FILE_SIZE, files: 1 },
      });

      let listingId = 0;
      let fileBuffer: Buffer | null = null;
      let fileName = "";

      const result = await new Promise<{
        listingId: number;
        fileBuffer: Buffer;
        fileName: string;
      }>((resolve, reject) => {
        const chunks: Buffer[] = [];

        busboy.on("field", (name: string, val: string) => {
          if (name === "listingId") listingId = parseInt(val, 10);
        });

        busboy.on("file", (_fieldname: string, stream: any, info: any) => {
          fileName = info.filename;
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            fileBuffer = Buffer.concat(chunks);
          });
        });

        busboy.on("finish", () => {
          if (!fileBuffer || !listingId) {
            reject(new Error("Missing required fields: file and listingId"));
          } else {
            resolve({ listingId, fileBuffer, fileName });
          }
        });

        busboy.on("error", reject);
        req.pipe(busboy);
      });

      // Verify listing exists and belongs to this user (or admin)
      const listing = await db.getListingById(result.listingId);
      if (!listing) {
        return res.status(404).json({ error: "Listing not found" });
      }
      if (listing.sellerId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "Not your listing" });
      }

      // Validate file extension
      const lowerName = result.fileName.toLowerCase();
      const ext = Object.keys(ALLOWED_EXTENSIONS).find(e => lowerName.endsWith(e));
      if (!ext) {
        return res.status(400).json({
          error: `Invalid file type. Allowed: ${Object.keys(ALLOWED_EXTENSIONS).join(", ")}`,
        });
      }

      // Check file size
      if (result.fileBuffer.length > MAX_MARKETPLACE_FILE_SIZE) {
        return res.status(400).json({ error: `File too large. Max ${MAX_MARKETPLACE_FILE_SIZE / (1024 * 1024)}MB` });
      }

      // ─── Anti-Resale Protection ───────────────────────────────────
      // Hash the file to detect duplicate uploads (prevents reselling purchased items)
      const fileHash = crypto.createHash("sha256").update(result.fileBuffer).digest("hex");

      // Check if this exact file already exists in another listing
      const database = await db.getDb();
      if (database) {
        try {
          const { marketplaceListings, marketplacePurchases } = await import("../drizzle/schema");
          const { eq, and, ne } = await import("drizzle-orm");

          // Check 1: Does this file hash already exist in another listing?
          const duplicates = await database.select({ id: marketplaceListings.id, uid: marketplaceListings.uid, title: marketplaceListings.title, sellerId: marketplaceListings.sellerId })
            .from(marketplaceListings)
            .where(and(
              eq(marketplaceListings.fileHash, fileHash),
              ne(marketplaceListings.id, result.listingId)
            ))
            .limit(1);

          if (duplicates.length > 0 && duplicates[0].sellerId !== listing.sellerId) {
            return res.status(403).json({
              error: "Anti-resale protection: This file is identical to an existing marketplace listing. Only original work can be sold on the Bazaar.",
              existingListing: duplicates[0].uid,
            });
          }

          // Check 2: Has this seller purchased an item and is now trying to re-upload it?
          const sellerPurchases = await database.select({ listingId: marketplacePurchases.listingId })
            .from(marketplacePurchases)
            .where(eq(marketplacePurchases.buyerId, user.id));

          if (sellerPurchases.length > 0) {
            const purchasedListingIds = sellerPurchases.map(p => p.listingId);
            for (const purchasedId of purchasedListingIds) {
              const purchasedListing = await database.select({ fileHash: marketplaceListings.fileHash })
                .from(marketplaceListings)
                .where(eq(marketplaceListings.id, purchasedId))
                .limit(1);
              if (purchasedListing.length > 0 && purchasedListing[0].fileHash === fileHash) {
                return res.status(403).json({
                  error: "Anti-resale protection: You cannot re-list an item you purchased. Only original work and upgrade packs are allowed.",
                });
              }
            }
          }
        } catch (antiResaleErr: unknown) {
          log.warn("[Marketplace] Anti-resale check warning (non-fatal):", { error: getErrorMessage(antiResaleErr) });
        }
      }

      // ── SECURITY: Malware Scanning ───────────────────────────────
      // Scan uploaded files for malware patterns, reverse shells, crypto miners,
      // obfuscated code, data exfiltration, and prototype pollution.
      const scannable = [".js", ".ts", ".py", ".json", ".md", ".txt"];
      if (scannable.some(s => lowerName.endsWith(s))) {
        const fileContent = result.fileBuffer.toString("utf-8");
        const malwareScan = await scanFileForMalware(fileContent, result.fileName, user.id);
        if (!malwareScan.safe) {
          log.error(`[Marketplace] Malware detected in upload "${result.fileName}" (risk: ${malwareScan.riskScore}/100)`);
          await trackIncident(user.id, "malware_upload", user.role === "admin");
          return res.status(403).json({
            error: "Security scan failed: This file contains suspicious code patterns and cannot be uploaded.",
            riskScore: malwareScan.riskScore,
            threats: malwareScan.threats.map(t => t.label),
          });
        }
      }

      // Upload to S3 with user-organized path
      const hash = crypto.randomBytes(8).toString("hex");
      const sanitizedName = result.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const s3Key = `marketplace/users/${user.id}/${listing.uid}/${hash}-${sanitizedName}`;
      const mimeType = ALLOWED_EXTENSIONS[ext] || "application/octet-stream";
      const { url } = await storagePut(s3Key, result.fileBuffer, mimeType);

      // Create a backup copy under backups/ for recovery purposes
      try {
        const backupKey = `backups/users/${user.id}/marketplace/${listing.uid}/${timestamp}-${sanitizedName}`;
        await storagePut(backupKey, result.fileBuffer, mimeType);
        log.info(`[Marketplace] Backup stored: ${backupKey}`);
      } catch (backupErr: unknown) {
        log.warn(`[Marketplace] Backup failed (non-fatal): ${getErrorMessage(backupErr)}`);
      }

      // Update listing with file info + hash for anti-resale protection
      await db.updateListing(result.listingId, {
        fileUrl: url,
        fileSize: result.fileBuffer.length,
        fileType: ext.replace(".", ""),
        fileHash: fileHash,
      });

      return res.json({
        success: true,
        fileName: result.fileName,
        fileSize: result.fileBuffer.length,
        fileSizeMb: Math.round(result.fileBuffer.length / (1024 * 1024) * 100) / 100,
        fileType: ext,
        url,
      });
    } catch (err: unknown) {
      log.error("[Marketplace Upload Error]", { error: String(err) });
      return res.status(500).json({ error: getErrorMessage(err) || "Upload failed" });
    }
  });

  // ─── DOWNLOAD: Buyer downloads with purchase token ───────────────
  app.get("/api/marketplace/download/:token", async (req: Request, res: Response) => {
    try {
      // Auth check
      let user: any;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { token } = req.params;
      if (!token) {
        return res.status(400).json({ error: "Download token required" });
      }

      // Find purchase by download token
      const database = await db.getDb();
      if (!database) {
        return res.status(503).json({ error: "Database unavailable" });
      }

      const { marketplacePurchases, marketplaceListings } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const purchases = await database
        .select()
        .from(marketplacePurchases)
        .where(eq(marketplacePurchases.downloadToken, token))
        .limit(1);

      if (purchases.length === 0) {
        return res.status(404).json({ error: "Invalid download token" });
      }

      const purchase = purchases[0];

      // Verify buyer is the one downloading
      if (purchase.buyerId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "This download token does not belong to you" });
      }

      // Check download limit
      if (purchase.downloadCount >= purchase.maxDownloads) {
        return res.status(429).json({
          error: `Download limit reached (${purchase.maxDownloads} downloads). Contact support for additional downloads.`,
        });
      }

      // Check purchase status
      if (purchase.status !== "completed") {
        return res.status(400).json({ error: "Purchase is not in completed status" });
      }

      // Get listing to find file URL
      const listing = await db.getListingById(purchase.listingId);
      if (!listing) {
        return res.status(404).json({ error: "Listing no longer exists" });
      }

      if (!listing.fileUrl) {
        return res.status(404).json({ error: "No file available for this listing yet. The seller has not uploaded the deliverable." });
      }

      // Increment download count
      const { sql } = await import("drizzle-orm");
      await database
        .update(marketplacePurchases)
        .set({
          downloadCount: sql`${marketplacePurchases.downloadCount} + 1`,
        })
        .where(eq(marketplacePurchases.downloadToken, token));

      // Also increment listing download count
      await database
        .update(marketplaceListings)
        .set({
          downloadCount: sql`${marketplaceListings.downloadCount} + 1`,
        })
        .where(eq(marketplaceListings.id, purchase.listingId));

      // Return the file URL for client-side download
      return res.json({
        success: true,
        downloadUrl: listing.fileUrl,
        fileName: listing.fileUrl.split("/").pop() || `${listing.slug}.zip`,
        fileSize: listing.fileSize,
        fileType: listing.fileType,
        downloadsUsed: purchase.downloadCount + 1,
        downloadsRemaining: purchase.maxDownloads - purchase.downloadCount - 1,
      });
    } catch (err: unknown) {
      log.error("[Marketplace Download Error]", { error: String(err) });
      return res.status(500).json({ error: getErrorMessage(err) || "Download failed" });
    }
  });

  log.info("[Marketplace] File upload/download routes registered");
}
