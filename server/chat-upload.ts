import { Express, Request, Response } from "express";
import { createContext } from "./_core/context";
import { storagePut } from "./storage";
import crypto from "crypto";
import { createLogger } from "./_core/logger.js";
import { scanFileForMalware, trackIncident } from "./security-fortress";
const log = createLogger("ChatUpload");

/**
 * Express route for chat file upload
 * POST /api/chat/upload
 * Accepts multipart files, uploads to S3, returns URL
 */
export function registerChatUploadRoute(app: Express) {
  app.post("/api/chat/upload", async (req: Request, res: Response) => {
    try {
      // Auth check
      const ctx = await createContext({ req, res, info: {} as any });
      if (!ctx.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Handle multipart form data using busboy
      const busboy = await import("busboy");
      const bb = busboy.default({ headers: req.headers });

      const fileChunks: Buffer[] = [];
      let fileMimeType = "application/octet-stream";

      bb.on("file", (_name: string, file: NodeJS.ReadableStream, info: { filename: string; encoding: string; mimeType: string }) => {
        fileMimeType = info.mimeType || "application/octet-stream";
        file.on("data", (data: Buffer) => fileChunks.push(data));
      });

      bb.on("finish", async () => {
        const fileBuffer = Buffer.concat(fileChunks);
        if (fileBuffer.length === 0) {
          return res.status(400).json({ error: "No file provided" });
        }

        // ── SECURITY: Malware scan on text-based uploads ─────────
        const textMimes = ["text/", "application/javascript", "application/json", "application/typescript"];
        if (textMimes.some(m => fileMimeType.startsWith(m))) {
          const content = fileBuffer.toString("utf-8");
          const scan = await scanFileForMalware(content, `chat-upload-${Date.now()}`, ctx.user!.id);
          if (!scan.safe) {
            log.error(`[Chat Upload] Malware detected (risk: ${scan.riskScore}/100)`);
            await trackIncident(ctx.user!.id, "malware_upload");
            return res.status(403).json({
              error: "File rejected: suspicious code patterns detected.",
              riskScore: scan.riskScore,
            });
          }
        }

        try {
          const randomSuffix = crypto.randomBytes(8).toString("hex");
          const fileKey = `chat/${ctx.user!.id}/${Date.now()}-${randomSuffix}`;

          const { url } = await storagePut(fileKey, fileBuffer, fileMimeType);
          res.json({ url, mimeType: fileMimeType, size: fileBuffer.length });
        } catch (err) {
          log.error("[Chat Upload] S3 upload failed:", { error: String(err) });
          res.status(500).json({ error: "Failed to upload file" });
        }
      });

      req.pipe(bb);
    } catch (err) {
      log.error("[Chat Upload] Error:", { error: String(err) });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });
}
