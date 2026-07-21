import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
  logger.error("TELEGRAM_BOT_TOKEN غير موجود — الصور لن تُرفع.");
}
if (!process.env.TELEGRAM_CHANNEL_ID?.trim()) {
  logger.error("TELEGRAM_CHANNEL_ID غير موجود.");
}
if (!process.env.NEON_DATABASE_URL?.trim()) {
  logger.warn("NEON_DATABASE_URL غير موجود — سيتم الرجوع إلى DATABASE_URL.");
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);

// Clerk proxy — must be before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// CORS: في الإنتاج يُقيَّد بـ ALLOWED_ORIGINS، في التطوير يُسمح بكل المصادر
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : null;

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // طلبات بدون origin (same-origin أو curl) — مسموح
      if (!origin) return callback(null, true);
      // بيئة تطوير بدون قائمة بيضاء — مسموح
      if (!allowedOrigins) return callback(null, true);
      // بيئة إنتاج — فقط المصادر المعتمدة
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: المصدر غير مسموح به: ${origin}`));
    },
  }),
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Clerk session middleware
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
