import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

// ─── Startup checks ────────────────────────────────────────────────────────────
// السيرفر يرفض تحميل الصور إن لم تكن هذه المفاتيح موجودة،
// لكن نُظهرها هنا مبكراً ليتمكن المشغّل من معرفة السبب.
if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
  logger.error(
    "TELEGRAM_BOT_TOKEN غير موجود — أضِفه في Replit Secrets. " +
    "الصور لن تُرفع حتى يُضبط هذا المفتاح."
  );
}
if (!process.env.TELEGRAM_CHANNEL_ID?.trim()) {
  logger.error(
    "TELEGRAM_CHANNEL_ID غير موجود — أضِفه في Replit Secrets. " +
    "يجب أن يكون معرّف القناة سالباً (مثال: -1001234567890)."
  );
}
if (!process.env.NEON_DATABASE_URL?.trim()) {
  logger.warn(
    "NEON_DATABASE_URL غير موجود — سيتم الرجوع إلى DATABASE_URL. " +
    "أضف NEON_DATABASE_URL في Replit Secrets لضمان الاتصال بقاعدة البيانات الصحيحة."
  );
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", router);

export default app;
