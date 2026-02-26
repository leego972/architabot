import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectMetaTags } from "../seo-engine";
import { createLogger } from "./logger.js";
const log = createLogger("Static");

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    log.error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
  }

  // Cache static assets aggressively (JS/CSS have content hashes)
  app.use(
    express.static(distPath, {
      maxAge: "1y",
      immutable: true,
      setHeaders(res, filePath) {
        // Don't cache index.html — it needs fresh meta tags
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    })
  );

  // fall through to index.html if the file doesn't exist
  // ── SEO v3: Read HTML, inject per-page meta tags, then send ──
  const indexPath = path.resolve(distPath, "index.html");
  let cachedHtml: string | null = null;

  app.use("*", (req, res) => {
    try {
      // Cache the raw HTML template in memory (it doesn't change between deploys)
      if (!cachedHtml) {
        cachedHtml = fs.readFileSync(indexPath, "utf-8");
      }
      const html = injectMetaTags(cachedHtml, req.originalUrl);
      res.set("Content-Type", "text/html");
      res.set("Cache-Control", "no-cache");
      res.send(html);
    } catch {
      // Fallback: just send the file directly
      res.sendFile(indexPath);
    }
  });
}
