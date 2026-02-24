import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { injectMetaTags } from "../seo-engine";
import { createLogger } from "./logger.js";
const log = createLogger("Vite");

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      let page = await vite.transformIndexHtml(url, template);

      // ── SEO v3: Inject per-page meta tags so crawlers see unique titles/descriptions ──
      page = injectMetaTags(page, url);

      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

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
