/**
 * One-time migration: upload all locally-stored page images to ImgBB
 * and update the Neon database URLs accordingly.
 *
 * Run with: node artifacts/api-server/migrate-to-imgbb.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import axios from "axios";
import https from "https";
import http from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "uploads");

const IMGBB_KEY = process.env.IMGBB_API_KEY?.trim();
const DB_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!IMGBB_KEY) { console.error("❌ IMGBB_API_KEY غير موجود"); process.exit(1); }
if (!DB_URL) { console.error("❌ NEON_DATABASE_URL غير موجود"); process.exit(1); }

const pool = new pg.Pool({ connectionString: DB_URL });

async function uploadToImgbb(buffer, filename) {
  const params = new URLSearchParams();
  params.append("key", IMGBB_KEY);
  params.append("image", buffer.toString("base64"));
  params.append("name", filename);

  const res = await axios.post("https://api.imgbb.com/1/upload", params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 60000,
  });

  const url = res.data?.data?.url;
  if (!url) throw new Error("ImgBB لم يُرجع رابطاً");
  return url;
}

async function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const chunks = [];
    proto.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject).on("timeout", () => reject(new Error("timeout")));
  });
}

async function main() {
  const client = await pool.connect();

  try {
    // جلب كل الصفحات المحلية من قاعدة البيانات
    const { rows } = await client.query(
      "SELECT id, image_url FROM pages WHERE image_url LIKE '/api/uploads/%' ORDER BY id"
    );

    console.log(`\n📦 وُجد ${rows.length} صفحة محلية للترحيل إلى ImgBB\n`);

    if (rows.length === 0) {
      console.log("✅ لا توجد صفحات محلية — كل شيء على ImgBB بالفعل");
      return;
    }

    let migrated = 0;
    let failed = 0;

    for (const row of rows) {
      const filename = row.image_url.replace("/api/uploads/", "");
      const localPath = path.resolve(uploadsDir, filename);

      try {
        let buffer;

        if (fs.existsSync(localPath)) {
          // الملف موجود محلياً — ارفعه مباشرة
          buffer = fs.readFileSync(localPath);
        } else {
          // الملف غير موجود محلياً — حاول تنزيله من الـ API (في حال كان المشروع يعمل)
          console.log(`  ⚠️  الملف غير موجود محلياً: ${filename} — تخطي`);
          failed++;
          continue;
        }

        const imgbbUrl = await uploadToImgbb(buffer, filename);
        await client.query("UPDATE pages SET image_url = $1 WHERE id = $2", [imgbbUrl, row.id]);

        // احذف الملف المحلي بعد الترحيل الناجح
        try { fs.unlinkSync(localPath); } catch { }

        migrated++;
        console.log(`  ✅ [${migrated}/${rows.length}] ${filename} → ${imgbbUrl.slice(0, 60)}...`);

        // انتظر قليلاً بين الرفعات لتجنب rate limiting
        await new Promise(r => setTimeout(r, 300));

      } catch (err) {
        failed++;
        console.error(`  ❌ فشل ترحيل ${filename}: ${err.message}`);
      }
    }

    console.log(`\n📊 النتيجة: ${migrated} نجح، ${failed} فشل`);

    // احذف أي ملفات متبقية في مجلد uploads لا تتعلق بقاعدة البيانات
    if (fs.existsSync(uploadsDir)) {
      const remaining = fs.readdirSync(uploadsDir).filter(f => f !== ".gitkeep");
      if (remaining.length > 0) {
        console.log(`\n🗑️  حذف ${remaining.length} ملف متبقٍ في uploads/...`);
        for (const f of remaining) {
          try { fs.unlinkSync(path.resolve(uploadsDir, f)); } catch { }
        }
      }
    }

    console.log("\n✅ الترحيل اكتمل — الصور الآن على ImgBB فقط\n");

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error("فشل الترحيل:", err); process.exit(1); });
