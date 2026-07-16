import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

// ─── Startup checks ───────────────────────────────────────────────────────────
if (!process.env.IMGBB_API_KEY?.trim()) {
  logger.error("IMGBB_API_KEY is not set — image uploads will be rejected. Add it to Replit Secrets.");
}
if (!process.env.NEON_DATABASE_URL?.trim()) {
  logger.warn("NEON_DATABASE_URL is not set — falling back to DATABASE_URL. Add NEON_DATABASE_URL to Replit Secrets.");
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
app.use("/api/uploads", express.static(uploadsDir));

app.use("/api", router);

export default app;
