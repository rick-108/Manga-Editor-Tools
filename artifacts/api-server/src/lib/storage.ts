/**
 * Storage — ImgBB only, no local fallback.
 *
 * الطلبات تمرّ عبر corsproxy.io لتجاوز حجب IP سيرفرات Replit.
 * IMGBB_API_KEY must be set in Replit Secrets.
 */

import fs from "fs";
import path from "path";
import axios from "axios";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

// Keep uploadsDir only for multer's temp landing spot — files are deleted after ImgBB upload.
export const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const IMGBB_ENDPOINT = "https://api.imgbb.com/1/upload";

// Proxy الطلب عبر corsproxy.io لتجاوز حجب IP
const PROXY_ENDPOINT = `https://corsproxy.io/?url=${encodeURIComponent(IMGBB_ENDPOINT)}`;

// Headers تجعل الطلب يبدو كمتصفح عادي
const BROWSER_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Origin": "https://imgbb.com",
  "Referer": "https://imgbb.com/",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

function requireImgbbKey(): string {
  const key = process.env.IMGBB_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "IMGBB_API_KEY is not set. Add it to Replit Secrets — images cannot be saved without it."
    );
  }
  return key;
}

export function usingImgbb(): boolean {
  return !!process.env.IMGBB_API_KEY?.trim();
}

interface ImgbbResponse {
  data: { url: string; display_url: string; image: { url: string } };
  success: boolean;
}

/**
 * إرسال طلب ImgBB عبر proxy مع fallback مباشر.
 */
async function postToImgbb(params: URLSearchParams): Promise<string> {
  // المحاولة الأولى: عبر corsproxy.io
  try {
    const res = await axios.post<ImgbbResponse>(PROXY_ENDPOINT, params, {
      headers: BROWSER_HEADERS,
      timeout: 90000,
    });
    const url = res.data?.data?.url;
    if (url) return url;
  } catch (proxyErr: any) {
    // إذا فشل الـ proxy جرّب مباشرة
    const msg = proxyErr?.response?.data?.error?.message ?? proxyErr?.message ?? String(proxyErr);
    if (msg.toLowerCase().includes("forbidden") || msg.includes("103")) {
      // لا فائدة من المحاولة المباشرة إذا كان الخطأ حجب IP
      throw new Error(`ImgBB upload failed (IP blocked): ${msg}`);
    }
  }

  // المحاولة الثانية: مباشرة مع browser headers
  const res = await axios.post<ImgbbResponse>(IMGBB_ENDPOINT, params, {
    headers: BROWSER_HEADERS,
    timeout: 60000,
  });
  const url = res.data?.data?.url;
  if (!url) throw new Error("ImgBB returned no URL");
  return url;
}

/**
 * Upload a local file to ImgBB via proxy.
 * Deletes the local file afterwards (it was only a multer temp file).
 */
export async function storeUploadedFile(
  localFilePath: string,
  filename: string
): Promise<string> {
  const key = requireImgbbKey();

  let base64: string;
  try {
    base64 = fs.readFileSync(localFilePath).toString("base64");
  } catch (err) {
    throw new Error(`Cannot read temp file for upload: ${err}`);
  }

  const params = new URLSearchParams();
  params.append("key", key);
  params.append("image", base64);
  params.append("name", filename);

  try {
    const url = await postToImgbb(params);
    try { fs.unlinkSync(localFilePath); } catch { }
    return url;
  } catch (err: any) {
    try { fs.unlinkSync(localFilePath); } catch { }
    throw new Error(`ImgBB upload failed: ${err?.response?.data?.error?.message ?? err?.message ?? err}`);
  }
}

/**
 * Upload a remote image URL to ImgBB via proxy.
 */
export async function storeRemoteImage(
  imageUrl: string,
  _filename: string,
  _referer: string
): Promise<string> {
  const key = requireImgbbKey();

  const params = new URLSearchParams();
  params.append("key", key);
  params.append("image", imageUrl);

  try {
    return await postToImgbb(params);
  } catch (err: any) {
    throw new Error(`ImgBB remote upload failed for ${imageUrl}: ${err?.response?.data?.error?.message ?? err?.message ?? err}`);
  }
}

/**
 * Upload a file buffer directly to ImgBB via proxy (used by migration script).
 */
export async function uploadBufferToImgbb(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const key = requireImgbbKey();

  const params = new URLSearchParams();
  params.append("key", key);
  params.append("image", buffer.toString("base64"));
  params.append("name", filename);

  return await postToImgbb(params);
}
