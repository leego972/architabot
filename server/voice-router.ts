import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { transcribeAudio } from "./_core/voiceTranscription";
import { storagePut } from "./storage";
import { TRPCError } from "@trpc/server";
import type { Express, Request, Response } from "express";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { createContext } from "./_core/context";
import crypto from "crypto";
import { createLogger } from "./_core/logger.js";
const log = createLogger("VoiceRouter");

/**
 * Voice transcription tRPC router
 * Handles transcription from an already-uploaded audio URL
 */
export const voiceRouter = router({
  transcribe: protectedProcedure
    .input(
      z.object({
        audioUrl: z.string().url(),
        language: z.string().optional(),
        prompt: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await transcribeAudio({
        audioUrl: input.audioUrl,
        language: input.language,
        prompt: input.prompt || "Transcribe the user's voice command for a chat assistant",
      });

      if ("error" in result) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error,
          cause: result,
        });
      }

      return {
        text: result.text,
        language: result.language,
        duration: result.duration,
      };
    }),
});

/**
 * Express route for audio file upload
 * POST /api/voice/upload
 * Accepts multipart audio, uploads to S3, returns URL
 */
export function registerVoiceUploadRoute(app: Express) {
  app.post("/api/voice/upload", async (req: Request, res: Response) => {
    try {
      // Auth check
      const ctx = await createContext({ req, res, info: {} } as CreateExpressContextOptions);
      if (!ctx.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Collect raw body chunks (audio binary)
      const chunks: Buffer[] = [];
      let totalSize = 0;
      const MAX_SIZE = 16 * 1024 * 1024; // 16MB

      // Check content type
      const contentType = req.headers["content-type"] || "";

      if (contentType.includes("multipart/form-data")) {
        // Handle multipart form data using busboy
        const busboy = await import("busboy");
        const bb = busboy.default({ headers: req.headers, limits: { fileSize: MAX_SIZE } });

        return new Promise<void>((resolve) => {
          let fileBuffer: Buffer | null = null;
          let fileMimeType = "audio/webm";

          bb.on("file", (_name: string, file: NodeJS.ReadableStream, info: { filename: string; encoding: string; mimeType: string }) => {
            const fileChunks: Buffer[] = [];
            fileMimeType = info.mimeType || "audio/webm";

            file.on("data", (data: Buffer) => {
              fileChunks.push(data);
            });

            file.on("end", () => {
              fileBuffer = Buffer.concat(fileChunks);
            });
          });

          bb.on("finish", async () => {
            if (!fileBuffer) {
              res.status(400).json({ error: "No audio file provided" });
              return resolve();
            }

            if (fileBuffer.length > MAX_SIZE) {
              res.status(413).json({ error: "Audio file exceeds 16MB limit" });
              return resolve();
            }

            try {
              const randomSuffix = crypto.randomBytes(8).toString("hex");
              const ext = getExtFromMime(fileMimeType);
              const fileKey = `voice/${ctx.user!.id}/${Date.now()}-${randomSuffix}.${ext}`;

              const { url } = await storagePut(fileKey, fileBuffer, fileMimeType);
              res.json({ url, mimeType: fileMimeType, size: fileBuffer.length });
            } catch (err) {
              log.error("[Voice Upload] S3 upload failed:", { error: String(err) });
              res.status(500).json({ error: "Failed to upload audio" });
            }
            resolve();
          });

          bb.on("error", (err: Error) => {
            log.error("[Voice Upload] Busboy error:", { error: String(err) });
            res.status(500).json({ error: "Failed to process upload" });
            resolve();
          });

          req.pipe(bb);
        });
      } else {
        // Handle raw binary upload
        req.on("data", (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > MAX_SIZE) {
            res.status(413).json({ error: "Audio file exceeds 16MB limit" });
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });

        req.on("end", async () => {
          if (res.headersSent) return;

          const audioBuffer = Buffer.concat(chunks);
          if (audioBuffer.length === 0) {
            return res.status(400).json({ error: "No audio data received" });
          }

          try {
            const mimeType = contentType.split(";")[0].trim() || "audio/webm";
            const randomSuffix = crypto.randomBytes(8).toString("hex");
            const ext = getExtFromMime(mimeType);
            const fileKey = `voice/${ctx.user!.id}/${Date.now()}-${randomSuffix}.${ext}`;

            const { url } = await storagePut(fileKey, audioBuffer, mimeType);
            res.json({ url, mimeType, size: audioBuffer.length });
          } catch (err) {
            log.error("[Voice Upload] S3 upload failed:", { error: String(err) });
            res.status(500).json({ error: "Failed to upload audio" });
          }
        });
      }
    } catch (err) {
      log.error("[Voice Upload] Error:", { error: String(err) });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });
}

function getExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
  };
  return map[mime] || "webm";
}
