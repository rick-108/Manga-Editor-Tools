/**
 * ترحيل الصور المحلية إلى ImgBB
 * الاستخدام: pnpm --filter @workspace/api-server exec tsx migrate-to-imgbb.ts
 */
import fs from "fs";
import path from "path";
import axios from "axios";
import { db, pagesTable } from "@workspace/db";
import { like } from "drizzle-orm";

const IMGBB_KEY = process.env.IMGBB_API_KEY?.trim();
if (!IMGBB_KEY) { console.error("❌ IMGBB_API_KEY غير موجود"); process.exit(1); }

const uploadsDir = path.resolve(process.cwd(), "uploads");

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
  const localPages = await db.select({ id: pagesTable.id, imageUrl: pagesTable.imageUrl })
    .from(pagesTable)
    .where(like(pagesTable.imageUrl, "/api/uploads/%"));

  console.log(`\n📦 ${localPages.length} صفحة محلية للترحيل إلى ImgBB\n`);
  if (localPages.length === 0) { console.log("✅ لا شيء للترحيل"); return; }

  let ok = 0, fail = 0;

  for (const page of localPages) {
    const filename = page.imageUrl.replace("/api/uploads/", "");
    const localPath = path.resolve(uploadsDir, filename);

    if (!fs.existsSync(localPath)) {
      console.log(`  ⚠️  الملف غير موجود: ${filename} — تخطي`);
      fail++; continue;
    }

    try {
      const buffer = fs.readFileSync(localPath);
      const imgbbUrl = await uploadToImgbb(buffer, filename);
      await db.update(pagesTable).set({ imageUrl: imgbbUrl }).where(
        // @ts-ignore
        (t: any, { eq }: any) => eq(t.id, page.id)
      );
      // استخدام SQL مباشر للتحديث
      await db.execute(`UPDATE pages SET image_url = '${imgbbUrl.replace(/'/g, "''")}' WHERE id = ${page.id}`);
      fs.unlinkSync(localPath);
      ok++;
      console.log(`  ✅ [${ok}] ${filename.slice(0, 30)} → ${imgbbUrl.slice(0, 55)}...`);
      await new Promise(r => setTimeout(r, 300));
    } catch (err: any) {
      fail++;
      console.error(`  ❌ فشل ${filename}: ${err.message}`);
    }
  }

  // احذف ما تبقى في مجلد uploads
  const remaining = fs.readdirSync(uploadsDir).filter(f => !f.startsWith("."));
  if (remaining.length) {
    console.log(`\n🗑️  حذف ${remaining.length} ملف متبقٍ...`);
    remaining.forEach(f => { try { fs.unlinkSync(path.resolve(uploadsDir, f)); } catch {} });
  }

  console.log(`\n📊 النتيجة: ${ok} نجح، ${fail} فشل`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
