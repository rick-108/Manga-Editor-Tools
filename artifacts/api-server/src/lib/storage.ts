/**
 * Storage abstraction layer.
 *
 * If IMGBB_API_KEY is set  → upload to ImgBB (free, no storage limit).
 * Otherwise               → save to local /uploads/ folder (default).
 *
 * ImgBB free tier:
 *   - No storage cap (images stay forever unless you delete them)
 *   - Max 32 MB per image
 *   - API docs: https://api.imgbb.com/
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import axios from "axios";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

export const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ─── ImgBB helpers ────────────────────────────────────────────────────────────

const IMGBB_ENDPOINT = "https://api.imgbb.com/1/upload";

function getImgbbKey(): string | null {
  return process.env.IMGBB_API_KEY?.trim() || null;
}

/**
 * Upload a local file (Buffer or path) to ImgBB.
 * Returns the direct image URL on success, null on failure.
 */
export async function uploadFileToImgbb(
  filePath: string,
  name?: string
): Promise<string | null> {
  const key = getImgbbKey();
  if (!key) return null;

  try {
    const base64 = fs.readFileSync(filePath).toString("base64");
    const params = new URLSearchParams();
    params.append("key", key);
    params.append("image", base64);
    if (name) params.append("name", name);

    const res = await axios.post<ImgbbResponse>(IMGBB_ENDPOINT, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 30000,
    });

    return res.data?.data?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Upload an image from a remote URL to ImgBB directly.
 * ImgBB fetches the URL itself — no local download needed.
 * Returns the direct image URL on success, null on failure.
 */
export async function uploadUrlToImgbb(
  imageUrl: string,
  name?: string
): Promise<string | null> {
  const key = getImgbbKey();
  if (!key) return null;

  try {
    const params = new URLSearchParams();
    params.append("key", key);
    params.append("image", imageUrl);
    if (name) params.append("name", name);

    const res = await axios.post<ImgbbResponse>(IMGBB_ENDPOINT, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 30000,
    });

    return res.data?.data?.url ?? null;
  } catch {
    return null;
  }
}

interface ImgbbResponse {
  data: {
    url: string;
    display_url: string;
    image: { url: string };
  };
  success: boolean;
}

// ─── Local fallback downloader ────────────────────────────────────────────────

/**
 * Download a remote image to the local /uploads/ folder.
 * Returns /api/uploads/<filename> path.
 */
export function downloadImageLocally(
  imageUrl: string,
  filename: string,
  referer: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const filePath = path.resolve(uploadsDir, filename);
    const file = fs.createWriteStream(filePath);
    const proto = imageUrl.startsWith("https") ? https : http;

    const req = proto.get(
      imageUrl,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Referer": referer,
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        timeout: 45000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(filePath, () => {});
          resolve(null);
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(`/api/uploads/${filename}`);
        });
      }
    );
    req.on("error", () => { file.close(); fs.unlink(filePath, () => {}); resolve(null); });
    req.on("timeout", () => { req.destroy(); file.close(); fs.unlink(filePath, () => {}); resolve(null); });
  });
}

// ─── Unified public API ───────────────────────────────────────────────────────

/**
 * Save a page that was uploaded as a local file.
 * 1. If IMGBB_API_KEY is set: upload to ImgBB → delete local file → return ImgBB URL.
 * 2. Otherwise: keep local file → return /api/uploads/<filename>.
 */
export async function storeUploadedFile(
  localFilePath: string,
  filename: string
): Promise<string> {
  const key = getImgbbKey();
  if (key) {
    const url = await uploadFileToImgbb(localFilePath, filename);
    if (url) {
      // Clean up local temp file — it's now on ImgBB
      try { fs.unlinkSync(localFilePath); } catch { }
      return url;
    }
    // ImgBB failed → fall back silently to local
  }
  return `/api/uploads/${filename}`;
}

/**
 * Save a remote image URL.
 * 1. If IMGBB_API_KEY is set: ask ImgBB to fetch it directly → return ImgBB URL.
 * 2. Otherwise: download locally → return /api/uploads/<filename>.
 */
export async function storeRemoteImage(
  imageUrl: string,
  filename: string,
  referer: string
): Promise<string | null> {
  const key = getImgbbKey();
  if (key) {
    const url = await uploadUrlToImgbb(imageUrl, filename);
    if (url) return url;
    // ImgBB failed → fall through to local download
  }
  return downloadImageLocally(imageUrl, filename, referer);
}

export function usingImgbb(): boolean {
  return !!getImgbbKey();
}
