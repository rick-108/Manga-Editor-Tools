#!/usr/bin/env node
/**
 * chapter-importer.mjs
 *
 * يستورد فصولاً من موقع خارجي ويخزّنها مباشرة في قاعدة البيانات + Telegram.
 * يعمل مستقلاً على GitHub Actions — لا يحتاج فتح الموقع أو Replit.
 *
 * المتطلبات (environment variables):
 *   NEON_DATABASE_URL    — رابط قاعدة البيانات
 *   TELEGRAM_BOT_TOKEN   — توكن البوت
 *   TELEGRAM_CHANNEL_ID  — معرّف القناة
 *
 * الاستخدام:
 *   node scripts/chapter-importer.mjs \
 *     --manga="سولو ليفلنغ" \
 *     --base-url="https://site.com/manga/solo-leveling" \
 *     --start=1 --end=10
 *
 *   --manga-id=5         (بديل للاسم — إذا عرفت الرقم)
 *   --no-publish         (استورد بدون نشر)
 *   --dry-run            (معاينة فقط بدون تغييرات)
 */

import pg from "pg";
import axios from "axios";
import * as cheerio from "cheerio";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE  = 3;     // صفحات متزامنة في Telegram
const BATCH_DELAY = 2000;  // ms بين دفعات Telegram
const RETRY_COUNT = 3;
const RETRY_DELAY = 3000;

// ─────────────────────────────────────────────────────────────────────────────
// ARGS
// ─────────────────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const getArg = (name) => {
  const found = args.find(a => a.startsWith(`--${name}=`));
  return found ? found.split("=").slice(1).join("=") : null;
};

const MANGA_NAME  = getArg("manga");                                  // اسم المانغا (بحث)
const MANGA_ID    = getArg("manga-id") ? parseInt(getArg("manga-id")) : null;
const BASE_URL    = getArg("base-url");                               // مثال: https://site.com/manga/title
const START       = parseInt(getArg("start") ?? "1");
const END         = parseInt(getArg("end")   ?? "1");
const DELAY_SEC   = parseInt(getArg("delay") ?? "10");
const AUTO_PUBLISH = !args.includes("--no-publish");
const DRY_RUN     = args.includes("--dry-run");

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

const DB_URL   = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const TG_CHAN  = process.env.TELEGRAM_CHANNEL_ID?.trim();

if (!DB_URL)            { console.error("❌  NEON_DATABASE_URL غير موجود"); process.exit(1); }
if (!TG_TOKEN)          { console.error("❌  TELEGRAM_BOT_TOKEN غير موجود"); process.exit(1); }
if (!TG_CHAN)           { console.error("❌  TELEGRAM_CHANNEL_ID غير موجود"); process.exit(1); }
if (!BASE_URL)          { console.error("❌  --base-url مطلوب"); process.exit(1); }
if (!MANGA_NAME && !MANGA_ID) { console.error("❌  يجب تحديد --manga=\"الاسم\" أو --manga-id=5"); process.exit(1); }
if (isNaN(START) || isNaN(END) || START > END) {
  console.error("❌  --start و --end يجب أن يكونا أرقاماً صحيحة (start ≤ end)");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────────────────────────────────────

const { Pool } = pg;
const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

/** البحث عن المانغا بالاسم */
async function findMangaByName(name) {
  const { rows } = await pool.query(
    `SELECT id, title FROM manga WHERE title ILIKE $1 ORDER BY id LIMIT 5`,
    [`%${name}%`]
  );
  return rows;
}

/** جلب المانغا بالرقم */
async function findMangaById(id) {
  const { rows } = await pool.query(`SELECT id, title FROM manga WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** التحقق من وجود الفصل مسبقاً */
async function chapterExists(mangaId, number) {
  const { rows } = await pool.query(
    `SELECT id FROM chapters WHERE manga_id = $1 AND number = $2`,
    [mangaId, number]
  );
  return rows[0] ?? null;
}

/** إنشاء فصل جديد */
async function createChapter(mangaId, number, title, status) {
  const { rows } = await pool.query(
    `INSERT INTO chapters (manga_id, number, title, status, published_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [mangaId, number, title, status, status === "published" ? new Date() : null]
  );
  return rows[0].id;
}

/** إدراج صفحة */
async function insertPage(chapterId, pageNumber, imageUrl) {
  await pool.query(
    `INSERT INTO pages (chapter_id, page_number, image_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (chapter_id, page_number) DO UPDATE SET image_url = EXCLUDED.image_url`,
    [chapterId, pageNumber, imageUrl]
  );
}

/** تحديث رابط الصورة بعد رفعها لـ Telegram */
async function updatePageUrl(chapterId, pageNumber, telegramUrl) {
  await pool.query(
    `UPDATE pages SET image_url = $1 WHERE chapter_id = $2 AND page_number = $3`,
    [telegramUrl, chapterId, pageNumber]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRAPING
// ─────────────────────────────────────────────────────────────────────────────

/** بناء رابط الفصل من BASE_URL ورقم الفصل */
function buildChapterUrl(base, num) {
  // يدعم: base/1  أو  base/chapter-1  أو  base?ch=1
  const clean = base.replace(/\/+$/, "");
  return `${clean}/${num}`;
}

/** محاولة جلب صفحة ويب مع headers المتصفح */
async function fetchPage(url) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let lastErr;
  for (let i = 0; i < RETRY_COUNT; i++) {
    if (i > 0) await sleep(RETRY_DELAY * i);
    try {
      const res = await axios.get(url, {
        timeout: 30_000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "ar,en-US;q=0.9",
          "Referer": new URL(url).origin + "/",
        },
        maxRedirects: 10,
        validateStatus: s => s < 400,
      });
      return res.data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/**
 * استخراج روابط الصور من HTML الفصل.
 * يجرب عدة أنماط شائعة في مواقع المانغا العربية.
 */
function extractImages(html, chapterUrl) {
  const $ = cheerio.load(html);
  const images = [];
  const origin = new URL(chapterUrl).origin;

  // أنماط شائعة — بالترتيب من الأكثر شيوعاً
  const selectors = [
    ".reading-content img",
    ".chapter-content img",
    "#chapter-reader img",
    ".page-chapter img",
    ".chapter img",
    "img[data-src]",
    "img[data-lazy-src]",
    ".pages-container img",
    "#pages img",
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const src =
        $(el).attr("data-src") ||
        $(el).attr("data-lazy-src") ||
        $(el).attr("src") || "";

      if (!src || src.includes("data:image")) return;

      let url = src.trim();
      if (url.startsWith("//")) url = "https:" + url;
      else if (url.startsWith("/"))  url = origin + url;

      if (url.startsWith("http")) images.push(url);
    });

    if (images.length >= 3) break; // وجدنا الصور بهذا الـ selector
  }

  // إزالة المكررات
  return [...new Set(images)];
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM
// ─────────────────────────────────────────────────────────────────────────────

function mimeFromExt(filename) {
  const ext = path.extname(filename).toLowerCase();
  return { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
           ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif" }[ext] ?? "image/jpeg";
}

async function uploadToTelegram(buffer, filename) {
  const blob = new Blob([buffer], { type: mimeFromExt(filename) });
  const form = new FormData();
  form.append("chat_id", TG_CHAN);
  form.append("document", blob, filename);

  const res = await axios.post(
    `https://api.telegram.org/bot${TG_TOKEN}/sendDocument`,
    form,
    { timeout: 120_000 }
  );

  const fileId = res.data?.result?.document?.file_id;
  if (!fileId) throw new Error(`Telegram لم يُرجع file_id: ${JSON.stringify(res.data).slice(0, 200)}`);
  return `/api/img/${fileId}`;
}

async function downloadAndUpload(imageUrl, filename) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let origin = "";
  try { origin = new URL(imageUrl).origin; } catch {}

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Referer": origin + "/",
    "Origin": origin,
    "sec-fetch-dest": "image",
    "sec-fetch-mode": "no-cors",
    "sec-fetch-site": "cross-site",
  };

  let lastErr = new Error("لم تبدأ أي محاولة");
  for (let attempt = 0; attempt < RETRY_COUNT; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY * attempt);
    try {
      const imgRes = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 60_000,
        headers,
        maxRedirects: 10,
        validateStatus: s => s < 400,
      });
      const buffer = Buffer.from(imgRes.data);
      if (buffer.length < 1024) { lastErr = new Error(`صورة صغيرة جداً (${buffer.length}B)`); continue; }
      return await uploadToTelegram(buffer, filename);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function importChapter(manga, chapterNum) {
  const chapterUrl = buildChapterUrl(BASE_URL, chapterNum);
  const label      = `[فصل ${chapterNum}]`;

  console.log(`\n${label} ── ${chapterUrl}`);

  // تحقق من وجود الفصل مسبقاً
  const existing = await chapterExists(manga.id, chapterNum);
  if (existing) {
    console.log(`  ⏭️   الفصل موجود مسبقاً (id=${existing.id}) — تخطّي`);
    return { skipped: true };
  }

  // جلب HTML الفصل
  let html;
  try {
    html = await fetchPage(chapterUrl);
  } catch (e) {
    console.error(`  ❌  فشل جلب الصفحة: ${e.message}`);
    return { failed: true };
  }

  // استخراج روابط الصور
  const imageUrls = extractImages(html, chapterUrl);
  if (imageUrls.length === 0) {
    console.error(`  ❌  لم يُعثر على صور في الصفحة — قد يكون الموقع يحمي محتواه أو الـ selector مختلف`);
    return { failed: true };
  }
  console.log(`  🖼️   عدد الصفحات: ${imageUrls.length}`);

  if (DRY_RUN) {
    imageUrls.forEach((u, i) => console.log(`     [dry] ص${i+1}: ${u.slice(0, 80)}`));
    return { dryRun: true };
  }

  // إنشاء الفصل في DB
  const chapterStatus = AUTO_PUBLISH ? "published" : "pending";
  const chapterId = await createChapter(manga.id, chapterNum, `فصل ${chapterNum}`, chapterStatus);
  console.log(`  ✅  أُنشئ الفصل في DB (id=${chapterId}، الحالة: ${chapterStatus})`);

  // رفع الصور لـ Telegram ثم حفظ الروابط
  let pageSuccess = 0;
  let pageFailed  = 0;

  for (let i = 0; i < imageUrls.length; i += BATCH_SIZE) {
    const batch = imageUrls.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (imgUrl, bi) => {
      const pageNum  = i + bi + 1;
      const ext      = (imgUrl.match(/\.(jpe?g|png|webp|gif|avif|bmp)/i) || [])[0] ?? ".jpg";
      const filename = `ch${chapterId}-p${pageNum}${ext}`;

      try {
        const telegramUrl = await downloadAndUpload(imgUrl, filename);
        await insertPage(chapterId, pageNum, telegramUrl);
        console.log(`     ص${pageNum} ✅`);
        pageSuccess++;
      } catch (e) {
        // احفظ الرابط الأصلي — سيُرفع لاحقاً بـ telegram-uploader
        await insertPage(chapterId, pageNum, imgUrl);
        console.warn(`     ص${pageNum} ⚠️  سيُعاد الرفع لاحقاً: ${e.message.slice(0, 60)}`);
        pageFailed++;
      }
    }));

    if (i + BATCH_SIZE < imageUrls.length) await sleep(BATCH_DELAY);
  }

  console.log(`  📊  ${pageSuccess} نجح / ${pageFailed} مؤجّل`);
  return { chapterId, pageSuccess, pageFailed };
}

async function main() {
  console.log("══════════════════════════════════════════════════════");
  console.log("  RTN Manga — Chapter Importer");
  console.log(`  ${new Date().toISOString()}`);
  if (DRY_RUN) console.log("  🔍  وضع المعاينة — لن يتم حفظ أي بيانات");
  console.log("══════════════════════════════════════════════════════");

  // ── إيجاد المانغا ─────────────────────────────────────────────────────────
  let manga;

  if (MANGA_ID) {
    manga = await findMangaById(MANGA_ID);
    if (!manga) { console.error(`❌  لا توجد مانغا برقم ${MANGA_ID}`); await pool.end(); process.exit(1); }
  } else {
    const results = await findMangaByName(MANGA_NAME);
    if (results.length === 0) {
      console.error(`❌  لا توجد مانغا باسم "${MANGA_NAME}" في قاعدة البيانات`);
      console.error(`    تأكد من إضافة المانغا أولاً من لوحة التحكم`);
      await pool.end(); process.exit(1);
    }
    if (results.length > 1) {
      console.log(`⚠️  وجدت أكثر من نتيجة للبحث عن "${MANGA_NAME}":`);
      results.forEach(r => console.log(`    - #${r.id}: ${r.title}`));
      console.log(`    سأستخدم الأولى: #${results[0].id} — ${results[0].title}`);
      console.log(`    يمكنك تحديد الرقم مباشرة بـ --manga-id=X لتجنب الغموض`);
    }
    manga = results[0];
  }

  console.log(`\n📚  المانغا: "${manga.title}" (id=${manga.id})`);
  console.log(`📡  من فصل ${START} إلى فصل ${END}`);
  console.log(`⏱️   تأخير بين الفصول: ${DELAY_SEC}s`);
  console.log(`🚀  النشر التلقائي: ${AUTO_PUBLISH ? "مفعّل" : "معطّل"}`);
  console.log();

  // ── استيراد الفصول ────────────────────────────────────────────────────────
  const stats = { imported: 0, skipped: 0, failed: 0 };

  for (let num = START; num <= END; num++) {
    const result = await importChapter(manga, num);

    if (result.skipped)       stats.skipped++;
    else if (result.failed)   stats.failed++;
    else if (result.dryRun)   stats.imported++;
    else                      stats.imported++;

    if (num < END) await sleep(DELAY_SEC * 1000);
  }

  // ── ملخص نهائي ───────────────────────────────────────────────────────────
  const total = END - START + 1;
  console.log("\n══════════════════════════════════════════════════════");
  console.log(`  النتيجة: ${total} فصل`);
  console.log(`  ✅  تم استيرادها:  ${stats.imported}`);
  console.log(`  ⏭️   موجودة مسبقاً: ${stats.skipped}`);
  console.log(`  ❌  فشلت:          ${stats.failed}`);
  console.log("══════════════════════════════════════════════════════");

  await pool.end();
  if (stats.failed > 0) process.exit(1);
}

main().catch(err => {
  console.error("خطأ فادح:", err.message);
  pool.end().finally(() => process.exit(1));
});
