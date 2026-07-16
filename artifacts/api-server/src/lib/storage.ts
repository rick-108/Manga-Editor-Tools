/**
 * Storage — ImgBB only, no local fallback.
 *
 * IMGBB_API_KEY must be set in Replit Secrets.
 * If it is missing, uploads are rejected at call time with a clear error.
 *
 * ImgBB free tier:
 *   - No storage cap (images stay forever unless deleted)
 *   - Max 32 MB per image
 *   - API docs: https://api.imgbb.com/
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
 * Upload a local file to ImgBB.
 * Deletes the local file afterwards (it was only a multer temp file).
 * Throws on failure — never falls back to local storage.
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
    const res = await axios.post<ImgbbResponse>(IMGBB_ENDPOINT, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 60000,
    });

    const url = res.data?.data?.url;
    if (!url) throw new Error("ImgBB returned no URL");

    // Delete temp file — it is now on ImgBB
    try { fs.unlinkSync(localFilePath); } catch { }
    return url;
  } catch (err: any) {
    // Delete temp file even on failure to keep disk clean
    try { fs.unlinkSync(localFilePath); } catch { }
    throw new Error(`ImgBB upload failed: ${err?.response?.data?.error?.message ?? err?.message ?? err}`);
  }
}

/**
 * Upload a remote image URL to ImgBB (ImgBB fetches it directly — no local download).
 * Throws on failure — never falls back to local storage.
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
    const res = await axios.post<ImgbbResponse>(IMGBB_ENDPOINT, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 60000,
    });

    const url = res.data?.data?.url;
    if (!url) throw new Error("ImgBB returned no URL");
    return url;
  } catch (err: any) {
    throw new Error(`ImgBB remote upload failed for ${imageUrl}: ${err?.response?.data?.error?.message ?? err?.message ?? err}`);
  }
}

/**
 * Upload a file buffer directly to ImgBB (used by migration script).
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

  const res = await axios.post<ImgbbResponse>(IMGBB_ENDPOINT, params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 60000,
  });

  const url = res.data?.data?.url;
  if (!url) throw new Error("ImgBB returned no URL");
  return url;
}
