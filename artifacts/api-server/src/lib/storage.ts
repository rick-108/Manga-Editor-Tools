/**
 * Storage — Telegram Bot
 *
 * الصور تُرفع إلى قناة Telegram عبر Bot، وتُخدَم عبر proxy endpoint محلي.
 * المتغيرات المطلوبة في Replit Secrets:
 *   TELEGRAM_BOT_TOKEN   — توكن البوت
 *   TELEGRAM_CHANNEL_ID  — معرّف القناة (سالب عادةً، مثال: -1001234567890)
 */

import fs from "fs";
import path from "path";
import axios from "axios";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

// مجلد مؤقت لـ multer فقط — يُحذف الملف بعد الرفع
export const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── helpers ──────────────────────────────────────────────────────────────────

function requireConfig(): { token: string; channelId: string } {
  const token     = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const channelId = process.env.TELEGRAM_CHANNEL_ID?.trim();
  if (!token)     throw new Error("TELEGRAM_BOT_TOKEN غير مضبوط في Replit Secrets");
  if (!channelId) throw new Error("TELEGRAM_CHANNEL_ID غير مضبوط في Replit Secrets");
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

/** رفع buffer مباشرة إلى Telegram وإرجاع رابط الـ proxy */
async function uploadToTelegram(buffer: Buffer, filename: string): Promise<string> {
  const { token, channelId } = requireConfig();

  // نستخدم FormData المدمج في Node 20
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
      `Telegram لم يُرجع file_id — استجابة: ${JSON.stringify(res.data).slice(0, 200)}`
    );
  }

  // نخزن رابطاً داخلياً يمر عبر السيرفر ← يخفي التوكن ويضمن الديمومة
  return `/api/img/${fileId}`;
}

// ── API العامة ────────────────────────────────────────────────────────────────

/** دائماً false — لم نعد نستخدم ImgBB */
export function usingImgbb(): boolean { return false; }

/**
 * رفع ملف محلي (multer temp) إلى Telegram ثم حذفه.
 * يرمي خطأ إذا فشل الرفع — لا fallback محلي.
 */
export async function storeUploadedFile(
  localFilePath: string,
  filename: string
): Promise<string> {
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(localFilePath);
  } catch (err) {
    throw new Error(`تعذّر قراءة الملف المؤقت: ${err}`);
  }

  try {
    const url = await uploadToTelegram(buffer, filename);
    try { fs.unlinkSync(localFilePath); } catch { /* تجاهل */ }
    return url;
  } catch (err: any) {
    try { fs.unlinkSync(localFilePath); } catch { /* تجاهل */ }
    throw new Error(`فشل رفع الصورة إلى Telegram: ${err?.response?.data?.description ?? err?.message ?? err}`);
  }
}

/**
 * تنزيل صورة من رابط خارجي ثم رفعها إلى Telegram.
 * يُستخدم في الاستيراد البعيد (remote import).
 */
export async function storeRemoteImage(
  imageUrl: string,
  filename: string,
  referer: string
): Promise<string> {
  // تنزيل الصورة أولاً
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

/**
 * رفع buffer مباشرة إلى Telegram (مستخدَم في سكريبت الترحيل).
 */
export async function uploadBufferToImgbb(
  buffer: Buffer,
  filename: string
): Promise<string> {
  return await uploadToTelegram(buffer, filename);
}
