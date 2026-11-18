import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import { authRouter } from "./routes/auth.js";
import { clubsRouter } from "./routes/clubs.js";
import { matchesRouter } from "./routes/matches.js";
import { botRouter } from "./routes/bot.js";
import { errorHandler, notFound } from "./lib/http.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(express.json({ limit: "200kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "varzea-api" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/clubs", clubsRouter);
  app.use("/api/matches", matchesRouter);
  app.use("/api/bot", botRouter);

  app.use("/api", (_req, _res, next) => next(notFound("Rota")));

  // Em produção, a própria API serve o painel web compilado (web/dist).
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (process.env.NODE_ENV === "production" && fs.existsSync(webDist)) {
    app.use(
      helmet.contentSecurityPolicy({
        directives: {
          "style-src": ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
          "font-src": ["'self'", "https://fonts.gstatic.com"],
        },
      }),
    );
    app.use(express.static(webDist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
