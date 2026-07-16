/**
 * ترحيل الصور المحلية → ImgBB وتحديث قاعدة Neon
 * الاستخدام: pnpm --filter @workspace/scripts exec tsx src/migrate-imgbb.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import axios from "axios";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../../artifacts/api-server/uploads");

const IMGBB_KEY = process.env.IMGBB_API_KEY?.trim();
const DB_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!IMGBB_KEY) { console.error("❌ IMGBB_API_KEY غير موجود"); process.exit(1); }
if (!DB_URL) { console.error("❌ NEON_DATABASE_URL غير موجود"); process.exit(1); }

const pool = new pg.Pool({ connectionString: DB_URL });

async function uploadToImgbb(buffer: Buffer, filename: string): Promise<string> {
  const params = new URLSearchParams();
  params.append("key", IMGBB_KEY!);
  params.append("image", buffer.toString("base64"));
  params.append("name", filename);
  const res = await axios.post<any>("https://api.imgbb.com/1/upload", params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 60000,
  });
  const url = res.data?.data?.url;
  if (!url) throw new Error("ImgBB لم يُرجع رابطاً");
  return url;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT id, image_url FROM pages WHERE image_url LIKE '/api/uploads/%' ORDER BY id"
    );

    console.log(`\n📦 ${rows.length} صفحة محلية للترحيل\n`);
    if (rows.length === 0) { console.log("✅ كل الصور على ImgBB بالفعل"); return; }

    let ok = 0, skip = 0, fail = 0;

    for (const row of rows) {
      const filename = (row.image_url as string).replace("/api/uploads/", "");
      const localPath = path.resolve(uploadsDir, filename);

      if (!fs.existsSync(localPath)) {
        console.log(`  ⚠️  ملف غير موجود: ${filename}`);
        skip++; continue;
      }

      try {
        const buffer = fs.readFileSync(localPath);
        const imgbbUrl = await uploadToImgbb(buffer, filename);
        await client.query("UPDATE pages SET image_url = $1 WHERE id = $2", [imgbbUrl, row.id]);
        fs.unlinkSync(localPath);
        ok++;
        console.log(`  ✅ [${ok}] ${filename.slice(0,28)} → ${imgbbUrl.slice(0,50)}...`);
        await new Promise(r => setTimeout(r, 250));
      } catch (err: any) {
        fail++;
        console.error(`  ❌ ${filename}: ${err.message}`);
      }
    }

    // احذف أي ملفات متبقية في uploads/
    if (fs.existsSync(uploadsDir)) {
      const remaining = fs.readdirSync(uploadsDir).filter(f => !f.startsWith("."));
      if (remaining.length) {
        console.log(`\n🗑️  حذف ${remaining.length} ملف متبقٍ...`);
        remaining.forEach(f => { try { fs.unlinkSync(path.resolve(uploadsDir, f)); } catch {} });
      }
    }

    console.log(`\n📊 النتيجة: ✅ ${ok} نجح  ⚠️ ${skip} غير موجود  ❌ ${fail} فشل\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
