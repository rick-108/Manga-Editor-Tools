/**
 * Storage — Telegram Bot (الخيار الوحيد، لا بديل)
 *
 * الصور تُرفع إلى قناة Telegram عبر Bot، وتُخدَم عبر proxy endpoint /api/img/:fileId
 *
 * المفاتيح المطلوبة في Replit Secrets (إلزامية — السيرفر يرفض الرفع بدونها):
 *   TELEGRAM_BOT_TOKEN   — توكن البوت من @BotFather
 *   TELEGRAM_CHANNEL_ID  — معرّف القناة (سالب: مثال -1001234567890)
 */

import fs from "fs";
import path from "path";
import axios from "axios";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

/** مجلد مؤقت لـ multer — الملفات تُحذف فور رفعها إلى Telegram */
export const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── helpers ──────────────────────────────────────────────────────────────────

function requireConfig(): { token: string; channelId: string } {
  const token     = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const channelId = process.env.TELEGRAM_CHANNEL_ID?.trim();
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN غير موجود في Replit Secrets.\n" +
      "أضف المفتاح: Replit → Tools → Secrets → TELEGRAM_BOT_TOKEN"
    );
  }
  if (!channelId) {
    throw new Error(
      "TELEGRAM_CHANNEL_ID غير موجود في Replit Secrets.\n" +
      "أضف المفتاح: Replit → Tools → Secrets → TELEGRAM_CHANNEL_ID\n" +
      "يجب أن يكون معرّفاً سالباً (مثال: -1001234567890)"
    );
  }
  return { token, channelId };
}

function mimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png",  ".webp": "image/webp",
    ".gif": "image/gif",  ".avif": "image/avif",
    ".bmp": "image/bmp",
  };
  return map[ext] ?? "image/jpeg";
}

/** رفع buffer إلى قناة Telegram وإرجاع رابط الـ proxy الدائم */
async function uploadToTelegram(buffer: Buffer, filename: string): Promise<string> {
  const { token, channelId } = requireConfig();

  const blob = new Blob([buffer], { type: mimeFromFilename(filename) });
  const form = new FormData();
  form.append("chat_id", channelId);
  form.append("document", blob, filename);

  const res = await axios.post<any>(
    `https://api.telegram.org/bot${token}/sendDocument`,
    form,
    { timeout: 120_000 }
  );

  const fileId: string | undefined = res.data?.result?.document?.file_id;
  if (!fileId) {
    throw new Error(
      `Telegram لم يُرجع file_id.\n` +
      `استجابة الـ API: ${JSON.stringify(res.data).slice(0, 300)}`
    );
  }

  // رابط proxy داخلي — يُخفي التوكن ويضمن ديمومة الرابط
  return `/api/img/${fileId}`;
}

// ── API العامة (المُستورَدة من routes) ───────────────────────────────────────

/**
 * رفع ملف مؤقت (من multer) إلى Telegram ثم حذفه.
 * يرمي خطأً صريحاً إذا كان أي Secret مفقوداً — لا fallback.
 */
export async function storeUploadedFile(
  localFilePath: string,
  filename: string
): Promise<string> {
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(localFilePath);
  } catch (err) {
    throw new Error(`تعذّر قراءة الملف المؤقت "${localFilePath}": ${err}`);
  }

  try {
    const url = await uploadToTelegram(buffer, filename);
    try { fs.unlinkSync(localFilePath); } catch { /* الملف المؤقت غير ضروري بعد النجاح */ }
    return url;
  } catch (err: any) {
    try { fs.unlinkSync(localFilePath); } catch { /* تنظيف حتى عند الفشل */ }
    const desc = err?.response?.data?.description ?? err?.message ?? String(err);
    throw new Error(`فشل رفع الصورة إلى Telegram: ${desc}`);
  }
}

/**
 * تنزيل صورة من رابط خارجي ثم رفعها إلى Telegram.
 * يُستخدم في مسار الاستيراد البعيد (remote import).
 * يرمي خطأً صريحاً إذا كانت Secrets مفقودة — لا fallback.
 */
export async function storeRemoteImage(
  imageUrl: string,
  filename: string,
  referer: string
): Promise<string> {
  const imgRes = await axios.get<ArrayBuffer>(imageUrl, {
    responseType: "arraybuffer",
    timeout: 60_000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": referer || new URL(imageUrl).origin,
      "Accept": "image/*,*/*",
    },
    maxRedirects: 10,
  });

  const buffer = Buffer.from(imgRes.data);
  return await uploadToTelegram(buffer, filename);
}
