/**
 * Project File Download Router
 * 
 * Provides server-side endpoints for downloading project files:
 * - GET /api/project-files/download/:fileId — Download a single file with correct Content-Disposition
 * - GET /api/project-files/download-zip — Download multiple files as a ZIP archive
 * 
 * All endpoints require authentication via session cookie.
 * Files are fetched from S3 or database on the server side, avoiding CORS issues.
 */

import type { Express, Request, Response } from "express";
import archiver from "archiver";
import { createContext } from "./_core/context";
import { createLogger } from "./_core/logger.js";
const log = createLogger("ProjectDownload");

/** Authenticate the request and return the user ID, or null if not authenticated */
async function authenticateRequest(req: Request, res: Response): Promise<number | null> {
  try {
    const ctx = await createContext({ req, res, info: {} as any });
    return ctx.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Get the user's sandbox ID */
async function getUserSandboxId(userId: number): Promise<number | null> {
  try {
    const { listSandboxes } = await import("./sandbox-engine");
    const sandboxes = await listSandboxes(userId);
    return sandboxes.length > 0 ? sandboxes[0].id : null;
  } catch {
    return null;
  }
}

/** Fetch a file record from the database, verifying ownership */
async function getFileRecord(fileId: number, sandboxId: number) {
  const { getDb } = await import("./db");
  const { sandboxFiles } = await import("../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return null;

  const [file] = await db
    .select()
    .from(sandboxFiles)
    .where(and(eq(sandboxFiles.id, fileId), eq(sandboxFiles.sandboxId, sandboxId)))
    .limit(1);

  return file || null;
}

/** Fetch file content from DB or S3 */
async function getFileContent(file: { content: string | null; s3Key: string | null; filePath: string }): Promise<string | null> {
  // Try database content first
  if (file.content) return file.content;

  // Try S3
  if (file.s3Key) {
    try {
      const { storageGet } = await import("./storage");
      const { url } = await storageGet(file.s3Key);
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch {}
  }

  return null;
}

/** Get the correct MIME type for a file extension */
function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    // Code files — all served as text/plain to prevent browser misinterpretation
    ts: "text/plain", tsx: "text/plain", js: "text/plain", jsx: "text/plain",
    py: "text/plain", rb: "text/plain", go: "text/plain", rs: "text/plain",
    java: "text/plain", kt: "text/plain", swift: "text/plain", c: "text/plain",
    cpp: "text/plain", h: "text/plain", cs: "text/plain", php: "text/plain",
    sh: "text/plain", bash: "text/plain", zsh: "text/plain",
    // Web files
    html: "text/html", css: "text/css",
    // Data files
    json: "application/json", xml: "application/xml",
    yaml: "text/plain", yml: "text/plain", toml: "text/plain",
    // Documentation
    md: "text/plain", txt: "text/plain", csv: "text/csv",
    // Config files
    env: "text/plain", gitignore: "text/plain", dockerignore: "text/plain",
    dockerfile: "text/plain", makefile: "text/plain",
    // Images
    svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", ico: "image/x-icon",
  };
  return map[ext] || "application/octet-stream";
}

export function registerProjectDownloadRoutes(app: Express) {
  /**
   * Download a single project file with correct filename and Content-Disposition.
   * GET /api/project-files/download/:fileId
   */
  app.get("/api/project-files/download/:fileId", async (req: Request, res: Response) => {
    try {
      const userId = await authenticateRequest(req, res);
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const fileId = parseInt(req.params.fileId, 10);
      if (isNaN(fileId)) {
        res.status(400).json({ error: "Invalid file ID" });
        return;
      }

      const sandboxId = await getUserSandboxId(userId);
      if (!sandboxId) {
        res.status(404).json({ error: "No sandbox found" });
        return;
      }

      const file = await getFileRecord(fileId, sandboxId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const content = await getFileContent(file);
      if (!content) {
        res.status(404).json({ error: "File content unavailable" });
        return;
      }

      const fileName = file.filePath.split("/").pop() || "file.txt";
      const mimeType = getMimeType(fileName);

      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader("Content-Length", Buffer.byteLength(content, "utf-8"));
      res.send(content);
    } catch (err) {
      log.error("[ProjectDownload] Single file error:", { error: String(err) });
      res.status(500).json({ error: "Download failed" });
    }
  });

  /**
   * Download multiple project files as a ZIP archive.
   * GET /api/project-files/download-zip?ids=1,2,3
   * GET /api/project-files/download-zip?project=myapp (download all files in a project)
   * GET /api/project-files/download-zip?all=true (download all files)
   */
  app.get("/api/project-files/download-zip", async (req: Request, res: Response) => {
    try {
      const userId = await authenticateRequest(req, res);
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const sandboxId = await getUserSandboxId(userId);
      if (!sandboxId) {
        res.status(404).json({ error: "No sandbox found" });
        return;
      }

      const { getDb } = await import("./db");
      const { sandboxFiles } = await import("../drizzle/schema");
      const { eq, and, inArray, desc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Database unavailable" });
        return;
      }

      let files: Array<{ id: number; filePath: string; content: string | null; s3Key: string | null; fileSize: number | null }>;

      const idsParam = req.query.ids as string;
      const projectParam = req.query.project as string;
      const allParam = req.query.all as string;

      if (idsParam) {
        // Download specific files by ID
        const ids = idsParam.split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
        if (ids.length === 0) {
          res.status(400).json({ error: "No valid file IDs provided" });
          return;
        }
        files = await db
          .select()
          .from(sandboxFiles)
          .where(and(eq(sandboxFiles.sandboxId, sandboxId), eq(sandboxFiles.isDirectory, 0), inArray(sandboxFiles.id, ids)));
      } else if (projectParam) {
        // Download all files in a project (by top-level directory name)
        const allFiles = await db
          .select()
          .from(sandboxFiles)
          .where(and(eq(sandboxFiles.sandboxId, sandboxId), eq(sandboxFiles.isDirectory, 0)))
          .orderBy(desc(sandboxFiles.createdAt));
        files = allFiles.filter(f => {
          const parts = f.filePath.split("/");
          const projectName = parts.length > 1 ? parts[0] : "general";
          return projectName === projectParam;
        });
      } else if (allParam === "true") {
        // Download all files
        files = await db
          .select()
          .from(sandboxFiles)
          .where(and(eq(sandboxFiles.sandboxId, sandboxId), eq(sandboxFiles.isDirectory, 0)))
          .orderBy(desc(sandboxFiles.createdAt));
      } else {
        res.status(400).json({ error: "Provide ?ids=1,2,3 or ?project=name or ?all=true" });
        return;
      }

      if (files.length === 0) {
        res.status(404).json({ error: "No files found" });
        return;
      }

      // Set up ZIP streaming response
      const zipName = projectParam ? `${projectParam}-files.zip` : "project-files.zip";
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(zipName)}"`);

      const archive = archiver("zip", { zlib: { level: 6 } });

      archive.on("error", (err) => {
        log.error("[ProjectDownload] ZIP archive error:", { error: String(err) });
        if (!res.headersSent) {
          res.status(500).json({ error: "ZIP creation failed" });
        }
      });

      // Pipe the archive stream directly to the response
      archive.pipe(res);

      // Add each file to the archive
      let addedCount = 0;
      for (const file of files) {
        try {
          const content = await getFileContent(file);
          if (content) {
            // Use the file path as the path inside the ZIP (preserves folder structure)
            const zipPath = file.filePath.startsWith("/") ? file.filePath.slice(1) : file.filePath;
            archive.append(content, { name: zipPath });
            addedCount++;
          }
        } catch (fileErr) {
          log.warn("[ProjectDownload] Skipping file:", { fileId: file.id, error: String(fileErr) });
        }
      }

      if (addedCount === 0) {
        // If no files could be added, we need to abort
        archive.abort();
        if (!res.headersSent) {
          res.status(404).json({ error: "No downloadable files found" });
        }
        return;
      }

      // Finalize the archive (this triggers the end of the stream)
      await archive.finalize();

      log.info(`[ProjectDownload] ZIP created: ${addedCount} files for user ${userId}`);
    } catch (err) {
      log.error("[ProjectDownload] ZIP download error:", { error: String(err) });
      if (!res.headersSent) {
        res.status(500).json({ error: "Download failed" });
      }
    }
  });
}
