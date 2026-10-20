import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { AnalysisError, analyzeImages } from "./analysis";
import { readExportedBundle } from "./recipient";
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  let active = 0;
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({
      ok: true,
      analysisAvailable: Boolean(process.env.OPENAI_API_KEY),
    }),
  );
  app.post(
    ["/api/analyze", "/api/recipient-check"],
    (req, res, next) => {
      const origin = req.headers.origin;
      if (
        origin &&
        ![
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://localhost:3001",
          "http://127.0.0.1:3001",
        ].includes(origin)
      ) {
        res.status(403).json({
          error:
            "This local API accepts requests only from the Mosaic workspace.",
        });
        return;
      }
      if (!req.is("application/json")) {
        res.status(415).json({ error: "Send a JSON image-analysis request." });
        return;
      }
      next();
    },
    express.json({ limit: "34mb" }),
    async (req, res) => {
      if (active >= 1) {
        res.status(429).json({
          error:
            "Another analysis is finishing or cancelling. Wait a moment, then retry.",
        });
        return;
      }
      active++;
      const controller = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) controller.abort();
      });
      try {
        const operation =
          req.path === "/api/recipient-check"
            ? readExportedBundle
            : analyzeImages;
        const result = await operation(req.body, {
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL,
          signal: controller.signal,
        });
        if (!res.destroyed) res.json(result);
      } catch (error) {
        if (!res.destroyed)
          res.status(error instanceof AnalysisError ? error.status : 500).json({
            error:
              error instanceof AnalysisError
                ? error.message
                : "Analysis could not be completed. Please try again.",
          });
      } finally {
        active--;
      }
    },
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = (error as { status?: number })?.status;
      res.status(status === 413 ? 413 : 400).json({
        error:
          status === 413
            ? "The bundle is too large. Use at most 24 MB of image files."
            : "The request could not be read. Check your images and try again.",
      });
    },
  );
  return app;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  createApp().listen(3001, "127.0.0.1", () =>
    console.log("Mosaic API ready on http://127.0.0.1:3001"),
  );
