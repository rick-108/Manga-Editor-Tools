#!/usr/bin/env node
/**
 * chapter-importer.mjs
 *
 * يستورد فصولاً من موقع خارجي ويخزّن روابط الصور مباشرة في قاعدة البيانات.
 * يعمل مستقلاً على GitHub Actions — لا يحتاج فتح الموقع أو Replit.
 *
 * المتطلبات (environment variables):
 *   NEON_DATABASE_URL    — رابط قاعدة البيانات
 *
 * الاستخدام:
 *   node scripts/chapter-importer.mjs \
 *     --manga="سولو ليفلنغ" \
 *     --base-url="https://despair-manga.net/one-piece-chapter-{chapter}/" \
 *     --start=1 --end=10
 *
 *   --manga-id=5         (بديل للاسم — إذا عرفت الرقم)
 *   --no-publish         (استورد بدون نشر)
 *   --dry-run            (معاينة فقط بدون تغييرات)
 *
 * صيغ BASE_URL المدعومة:
 *   {chapter}  — placeholder يُستبدل برقم الفصل:
 *                https://site.com/manga/solo-leveling-chapter-{chapter}/
 *   بدون placeholder — يُضاف رقم الفصل في النهاية:
 *                https://site.com/manga/solo-leveling  →  .../solo-leveling/5
 */

import pg from "pg";
import axios from "axios";
import * as cheerio from "cheerio";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

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

// يقرأ من env vars (GitHub Actions) أو CLI args (تشغيل يدوي)
const MANGA_NAME   = process.env.IMPORTER_MANGA_NAME  || getArg("manga")    || null;
const MANGA_ID     = process.env.IMPORTER_MANGA_ID
                       ? parseInt(process.env.IMPORTER_MANGA_ID)
                       : getArg("manga-id") ? parseInt(getArg("manga-id")) : null;
const BASE_URL     = process.env.IMPORTER_BASE_URL    || getArg("base-url") || null;
const START        = parseInt(process.env.IMPORTER_START   || getArg("start") || "1");
const END          = parseInt(process.env.IMPORTER_END     || getArg("end")   || "1");
const DELAY_SEC    = parseInt(process.env.IMPORTER_DELAY   || getArg("delay") || "5");
const AUTO_PUBLISH = process.env.IMPORTER_PUBLISH !== undefined
                       ? process.env.IMPORTER_PUBLISH !== "false"
                       : !args.includes("--no-publish");
const DRY_RUN      = process.env.IMPORTER_DRY_RUN === "true" || args.includes("--dry-run");

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

const DB_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!DB_URL)   { console.error("❌  NEON_DATABASE_URL غير موجود"); process.exit(1); }
if (!BASE_URL) { console.error("❌  --base-url مطلوب"); process.exit(1); }
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

/** إنشاء فصل جديد — title يُترك null لأن الفرونت يعرض "الفصل N" تلقائياً */
async function createChapter(mangaId, number, status) {
  const { rows } = await pool.query(
    `INSERT INTO chapters (manga_id, number, title, status, published_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [mangaId, number, null, status, status === "published" ? new Date() : null]
  );
  return rows[0].id;
}

/** إدراج صفحة بالرابط المباشر */
async function insertPage(chapterId, pageNumber, imageUrl) {
  await pool.query(
    `INSERT INTO pages (chapter_id, page_number, image_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (chapter_id, page_number) DO UPDATE SET image_url = EXCLUDED.image_url`,
    [chapterId, pageNumber, imageUrl]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRAPING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * بناء رابط الفصل من BASE_URL ورقم الفصل.
 *
 * يدعم صيغتين:
 *   1. {chapter} placeholder:  https://site.com/manga/solo-chapter-{chapter}/
 *      → يُستبدل {chapter} برقم الفصل مباشرة
 *
 *   2. بدون placeholder: يضيف رقم الفصل في نهاية الرابط
 *      https://site.com/manga/solo  →  https://site.com/manga/solo/5
 */
function buildChapterUrl(base, num) {
  if (base.includes("{chapter}")) {
    return base.replace(/\{chapter\}/g, String(num));
  }
  // fallback: أضف الرقم في النهاية
  return `${base.replace(/\/+$/, "")}/${num}`;
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

  // ── قراءة جميع سمات التحميل الذكي (lazy-load attributes) ──────────────────
  const lazyAttrs = [
    "data-src",
    "data-lazy-src",
    "data-original",
    "data-url",
    "data-wp-src",
    "data-cfsrc",
    "src",
  ];

  function resolveUrl(raw) {
    if (!raw || raw.includes("data:image") || raw.trim() === "") return null;
    let url = raw.trim();
    if (url.startsWith("//"))     url = "https:" + url;
    else if (url.startsWith("/")) url = origin + url;
    return url.startsWith("http") ? url : null;
  }

  function pickSrc(el) {
    for (const attr of lazyAttrs) {
      const val = $(el).attr(attr);
      const url = resolveUrl(val || "");
      if (url) return url;
    }
    return null;
  }

  // أنماط CSS للحاويات — بالترتيب من الأكثر شيوعاً
  const selectors = [
    ".reading-content img",
    ".chapter-content img",
    "#chapter-reader img",
    ".page-chapter img",
    ".chapter-images img",
    ".chapter img",
    "#readerarea img",
    ".ts-reader img",
    ".reader-area img",
    "img[data-src]",
    "img[data-lazy-src]",
    "img[data-original]",
    "img[data-url]",
    "img[data-wp-src]",
    "img[data-cfsrc]",
    ".pages-container img",
    "#pages img",
    ".page-break img",
    "img.wp-manga-chapter-img",
  ];

  for (const sel of selectors) {
    const found = [];
    $(sel).each((_, el) => {
      const url = pickSrc(el);
      if (url) found.push(url);
    });

    if (found.length >= 3) {
      found.forEach(u => images.push(u));
      break;
    }
  }

  return [...new Set(images)];
}

/**
 * Fallback لمواقع ts_reader / mangareader WordPress التي تحمّل الصور عبر JS.
 * تستخرج مسار مجلد الفصل من og:image ثم تعدّد الصور تسلسلياً حتى 404.
 */
async function extractImagesFromOgAndEnumerate(html, chapterUrl) {
  const $ = cheerio.load(html);
  const origin = new URL(chapterUrl).origin;

  const ogImage = $('meta[property="og:image"]').attr("content") || "";
  if (!ogImage) return [];

  const lastSlash = ogImage.lastIndexOf("/");
  if (lastSlash === -1) return [];
  const baseDir  = ogImage.slice(0, lastSlash + 1);
  const firstName = ogImage.slice(lastSlash + 1);
  const extMatch  = firstName.match(/\.(webp|jpe?g|png|avif|gif)$/i);
  const ext       = extMatch ? extMatch[0] : ".webp";

  console.log(`  🔍  ts_reader mode — عدّد الصور من: ${baseDir}`);

  const MAX_PAGES = 300;
  const images    = [];

  for (let i = 1; i <= MAX_PAGES; i++) {
    const padded  = String(i).padStart(3, "0");
    const testUrl = `${baseDir}${padded}${ext}`;

    try {
      const res = await axios.head(testUrl, {
        timeout: 10_000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": origin + "/",
        },
        validateStatus: s => s < 500,
        maxRedirects: 5,
      });

      if (res.status === 200 || res.status === 301 || res.status === 302) {
        images.push(testUrl);
      } else {
        break; // 404 — انتهت صفحات الفصل
      }
    } catch {
      break;
    }
  }

  return images;
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

  // استخراج روابط الصور — المحاولة الأولى بالـ selectors العادية
  let imageUrls = extractImages(html, chapterUrl);

  // إذا لم نجد صوراً، ربما الموقع يحمّلها عبر JavaScript (ts_reader / mangareader)
  if (imageUrls.length === 0) {
    console.log(`  ⚠️   لم تُوجد صور بالـ selectors العادية — جاري تجربة وضع ts_reader…`);
    imageUrls = await extractImagesFromOgAndEnumerate(html, chapterUrl);
  }

  if (imageUrls.length === 0) {
    console.error(`  ❌  لم يُعثر على صور في الصفحة — قد يكون الموقع يحمي محتواه أو الـ selector مختلف`);
    return { failed: true };
  }
  console.log(`  🖼️   عدد الصفحات: ${imageUrls.length}`);

  if (DRY_RUN) {
    imageUrls.forEach((u, i) => console.log(`     [dry] ص${i + 1}: ${u.slice(0, 100)}`));
    return { dryRun: true };
  }

  // إنشاء الفصل في DB
  const chapterStatus = AUTO_PUBLISH ? "published" : "pending";
  const chapterId = await createChapter(manga.id, chapterNum, chapterStatus);
  console.log(`  ✅  أُنشئ الفصل في DB (id=${chapterId}، الحالة: ${chapterStatus})`);

  // حفظ روابط الصور المباشرة في DB — بدون رفع لتليجرام
  let pageSuccess = 0;
  let pageFailed  = 0;

  for (let i = 0; i < imageUrls.length; i++) {
    const pageNum = i + 1;
    try {
      await insertPage(chapterId, pageNum, imageUrls[i]);
      pageSuccess++;
    } catch (e) {
      console.error(`     ص${pageNum} ❌  ${e.message.slice(0, 80)}`);
      pageFailed++;
    }
  }

  console.log(`  📊  ${pageSuccess} صفحة محفوظة / ${pageFailed} فشلت`);
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
  console.log(`🔗  نمط الرابط: ${BASE_URL}`);
  console.log();

  // ── استيراد الفصول ────────────────────────────────────────────────────────
  const stats = { imported: 0, skipped: 0, failed: 0 };

  for (let num = START; num <= END; num++) {
    const result = await importChapter(manga, num);

    if (result.skipped)     stats.skipped++;
    else if (result.failed) stats.failed++;
    else                    stats.imported++;

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
