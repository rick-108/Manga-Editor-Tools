#!/usr/bin/env node
/**
 * chapter-importer.mjs
 *
 * يستورد فصولاً من موقع خارجي، يرفع الصور إلى Telegram بشكل متوازٍ،
 * ويخزّن /api/img/<file_id> في قاعدة البيانات.
 *
 * وضعان للتشغيل:
 *   A) وضع القائمة (Queue Mode) — يقرأ scripts/manga-queue.json
 *      node scripts/chapter-importer.mjs --queue
 *
 *   B) وضع يدوي — يحدد المانغا والرابط مباشرة
 *      node scripts/chapter-importer.mjs \
 *        --manga="ون بيس" \
 *        --base-url="https://despair-manga.net/one-piece-chapter-1/" \
 *        --start=1 --end=50
 *
 * المتطلبات (environment variables):
 *   NEON_DATABASE_URL     — رابط قاعدة البيانات
 *   TELEGRAM_BOT_TOKEN    — توكن البوت
 *   TELEGRAM_CHANNEL_ID   — معرّف القناة (سالب)
 *
 * صيغ BASE_URL المدعومة:
 *   {chapter}    → يُستبدل برقم الفصل:  .../one-piece-chapter-{chapter}/
 *   chapter-N    → يُستبدل الرقم تلقائياً: .../one-piece-chapter-1/ → .../chapter-60/
 *   بدون pattern → يُضاف الرقم في النهاية: .../solo → .../solo/5
 */

import pg              from "pg";
import axios           from "axios";
import * as cheerio    from "cheerio";
import fs              from "fs";
import path            from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const CHAPTER_CONCURRENCY = 2;     // فصلان يُعالجان في نفس الوقت
const PAGE_CONCURRENCY    = 4;     // صفحات مرفوعة بالتوازي داخل كل فصل
const BATCH_LIMIT         = 50;    // أقصى عدد فصول في التشغيلة الواحدة
const PAGE_BATCH_DELAY_MS = 1000;  // ms بين دفعات الصفحات (تحكم بالمعدل)
const FETCH_RETRY_COUNT   = 3;     // محاولات جلب الصفحة
const FETCH_RETRY_DELAY   = 3000;  // ms بين محاولات الجلب
const TG_RETRY_COUNT      = 5;     // محاولات رفع الصورة لتليجرام
const TG_RETRY_BASE_MS    = 2000;  // أساس الانتظار الأسي عند 429

// ─────────────────────────────────────────────────────────────────────────────
// ARGS
// ─────────────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const getArg  = (name) => { const f = args.find(a => a.startsWith(`--${name}=`)); return f ? f.split("=").slice(1).join("=") : null; };
const hasFlag = (name) => args.includes(`--${name}`);

const QUEUE_MODE   = process.env.QUEUE_MODE === "true" || hasFlag("queue");
const MANGA_NAME   = process.env.IMPORTER_MANGA_NAME || getArg("manga")    || null;
const MANGA_ID_RAW = process.env.IMPORTER_MANGA_ID   || getArg("manga-id") || null;
const MANGA_ID     = MANGA_ID_RAW ? parseInt(MANGA_ID_RAW) : null;
const BASE_URL     = process.env.IMPORTER_BASE_URL   || getArg("base-url") || null;
const START        = parseInt(process.env.IMPORTER_START  || getArg("start") || "1");
const END          = parseInt(process.env.IMPORTER_END    || getArg("end")   || "1");
const DELAY_SEC    = parseInt(process.env.IMPORTER_DELAY  || getArg("delay") || "2");
const AUTO_PUBLISH = process.env.IMPORTER_PUBLISH !== undefined
                       ? process.env.IMPORTER_PUBLISH !== "false"
                       : !hasFlag("no-publish");
const DRY_RUN      = process.env.IMPORTER_DRY_RUN === "true" || hasFlag("dry-run");

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

const DB_URL   = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const TG_CHAN  = process.env.TELEGRAM_CHANNEL_ID?.trim();

if (!DB_URL)   { console.error("❌  NEON_DATABASE_URL غير موجود"); process.exit(1); }
if (!TG_TOKEN) { console.error("❌  TELEGRAM_BOT_TOKEN غير موجود"); process.exit(1); }
if (!TG_CHAN)  { console.error("❌  TELEGRAM_CHANNEL_ID غير موجود"); process.exit(1); }

if (!QUEUE_MODE) {
  if (!BASE_URL) { console.error("❌  --base-url مطلوب"); process.exit(1); }
  if (!MANGA_NAME && !MANGA_ID) { console.error("❌  يجب تحديد --manga=\"الاسم\" أو --manga-id=5"); process.exit(1); }
  if (isNaN(START) || isNaN(END) || START > END) {
    console.error("❌  --start و --end يجب أن يكونا أرقاماً صحيحة (start ≤ end)");
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────────────────────────────────────

const { Pool } = pg;
const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function findMangaByName(name) {
  const { rows } = await pool.query(
    `SELECT id, title FROM manga WHERE title ILIKE $1 ORDER BY id LIMIT 5`,
    [`%${name}%`]
  );
  return rows;
}

async function findMangaById(id) {
  const { rows } = await pool.query(`SELECT id, title FROM manga WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function chapterExists(mangaId, number) {
  const { rows } = await pool.query(
    `SELECT id FROM chapters WHERE manga_id = $1 AND number = $2`,
    [mangaId, number]
  );
  return rows[0] ?? null;
}

/** أكبر رقم فصل موجود في DB لهذه المانغا (0 إذا لا يوجد شيء) */
async function getMaxImportedChapter(mangaId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(number), 0) AS max_ch FROM chapters WHERE manga_id = $1`,
    [mangaId]
  );
  return parseInt(rows[0].max_ch);
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

async function insertPage(chapterId, pageNumber, imageUrl) {
  await pool.query(
    `INSERT INTO pages (chapter_id, page_number, image_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (chapter_id, page_number) DO UPDATE SET image_url = EXCLUDED.image_url`,
    [chapterId, pageNumber, imageUrl]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// URL BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * يبني رابط الفصل من BASE_URL ورقم الفصل. يدعم ثلاث صيغ:
 *   1. {chapter} placeholder صريح:  one-piece-chapter-{chapter}/
 *   2. رقم مكتوب بعد chapter-/ep-/ch-:  one-piece-chapter-1/ → chapter-60/
 *   3. fallback: يضيف الرقم في النهاية
 */
function buildChapterUrl(base, num) {
  if (base.includes("{chapter}")) {
    return base.replace(/\{chapter\}/g, String(num));
  }
  const chapterPattern = /((chapter|chap|ep|ch|فصل)-)(\d+)/i;
  if (chapterPattern.test(base)) {
    return base.replace(chapterPattern, `$1${num}`);
  }
  return `${base.replace(/\/+$/, "")}/${num}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRAPING
// ─────────────────────────────────────────────────────────────────────────────

const BROWSER_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "text/html,application/xhtml+xml",
  "Accept-Language": "ar,en-US;q=0.9",
};

async function fetchPage(url) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let lastErr;
  for (let i = 0; i < FETCH_RETRY_COUNT; i++) {
    if (i > 0) await sleep(FETCH_RETRY_DELAY * i);
    try {
      const res = await axios.get(url, {
        timeout: 30_000,
        headers: { ...BROWSER_HEADERS, "Referer": new URL(url).origin + "/" },
        maxRedirects: 10,
        validateStatus: s => s < 400,
      });
      return res.data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

function extractImages(html, chapterUrl) {
  const $ = cheerio.load(html);
  const images = [];
  const origin = new URL(chapterUrl).origin;

  const lazyAttrs = ["data-src","data-lazy-src","data-original","data-url","data-wp-src","data-cfsrc","src"];

  function resolveUrl(raw) {
    if (!raw || raw.includes("data:image") || raw.trim() === "") return null;
    let url = raw.trim();
    if (url.startsWith("//"))     url = "https:" + url;
    else if (url.startsWith("/")) url = origin + url;
    return url.startsWith("http") ? url : null;
  }

  function pickSrc(el) {
    for (const attr of lazyAttrs) {
      const url = resolveUrl($(el).attr(attr) || "");
      if (url) return url;
    }
    return null;
  }

  const selectors = [
    ".reading-content img", ".chapter-content img", "#chapter-reader img",
    ".page-chapter img", ".chapter-images img", ".chapter img",
    "#readerarea img", ".ts-reader img", ".reader-area img",
    "img[data-src]", "img[data-lazy-src]", "img[data-original]",
    "img[data-url]", "img[data-wp-src]", "img[data-cfsrc]",
    ".pages-container img", "#pages img", ".page-break img",
    "img.wp-manga-chapter-img",
  ];

  for (const sel of selectors) {
    const found = [];
    $(sel).each((_, el) => { const url = pickSrc(el); if (url) found.push(url); });
    if (found.length >= 3) { found.forEach(u => images.push(u)); break; }
  }

  return [...new Set(images)];
}

/**
 * Fallback لمواقع ts_reader / mangareader WordPress.
 * تستخرج مسار المجلد من og:image ثم تعدّد الصور حتى 404.
 */
async function extractImagesFromOgAndEnumerate(html, chapterUrl) {
  const $ = cheerio.load(html);
  const origin = new URL(chapterUrl).origin;
  const ogImage = $('meta[property="og:image"]').attr("content") || "";
  if (!ogImage) return [];

  const lastSlash = ogImage.lastIndexOf("/");
  if (lastSlash === -1) return [];
  const baseDir   = ogImage.slice(0, lastSlash + 1);
  const firstName = ogImage.slice(lastSlash + 1);
  const extMatch  = firstName.match(/\.(webp|jpe?g|png|avif|gif)$/i);
  const ext       = extMatch ? extMatch[0] : ".webp";

  console.log(`  🔍  ts_reader mode — عدّد الصور من: ${baseDir}`);

  const images = [];
  for (let i = 1; i <= 300; i++) {
    const testUrl = `${baseDir}${String(i).padStart(3, "0")}${ext}`;
    try {
      const res = await axios.head(testUrl, {
        timeout: 10_000,
        headers: { ...BROWSER_HEADERS, "Referer": origin + "/" },
        validateStatus: s => s < 500,
        maxRedirects: 5,
      });
      if (res.status === 200 || res.status === 301 || res.status === 302) {
        images.push(testUrl);
      } else {
        break;
      }
    } catch { break; }
  }
  return images;
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM UPLOAD (STREAMING — بدون كتابة ملفات مؤقتة)
// ─────────────────────────────────────────────────────────────────────────────

function mimeFromUrl(url) {
  const ext = (url.match(/\.(jpe?g|png|webp|gif|avif|bmp)/i) || [])[0]?.toLowerCase() ?? ".jpg";
  return { ".jpg":".jpg",".jpeg":"image/jpeg",".png":"image/png",
           ".webp":"image/webp",".gif":"image/gif",".avif":"image/avif",".bmp":"image/bmp" }[ext]
    ?? "image/jpeg";
}

/**
 * يجلب الصورة من الرابط المصدر ويرفعها مباشرةً إلى Telegram.
 * - لا يكتب ملفاً على القرص
 * - Exponential Backoff عند خطأ 429
 * - يُعيد /api/img/<file_id>
 */
async function uploadImageToTelegram(imageUrl, referer) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let lastErr;
  let origin = "";
  try { origin = new URL(referer || imageUrl).origin; } catch {}

  const imgHeaders = {
    ...BROWSER_HEADERS,
    "Accept":        "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Referer":       referer || origin + "/",
    "Origin":        origin,
    "sec-fetch-dest":"image",
    "sec-fetch-mode":"no-cors",
    "sec-fetch-site":"cross-site",
  };

  for (let attempt = 0; attempt < TG_RETRY_COUNT; attempt++) {
    try {
      // ① جلب الصورة كـ buffer (لا كتابة لقرص)
      const imgRes = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 60_000,
        headers: imgHeaders,
        maxRedirects: 10,
        validateStatus: s => s < 400,
      });
      const buffer = Buffer.from(imgRes.data);
      if (buffer.length < 512) {
        throw new Error(`الصورة صغيرة جداً (${buffer.length} bytes) — ربما placeholder`);
      }

      // ② رفع مباشر لتليجرام من الذاكرة
      const mime     = mimeFromUrl(imageUrl);
      const ext      = (imageUrl.match(/\.(jpe?g|png|webp|gif|avif)/i) || [])[0] ?? ".jpg";
      const filename = `page${ext}`;
      const blob     = new Blob([buffer], { type: mime });
      const form     = new FormData();
      form.append("chat_id",  TG_CHAN);
      form.append("document", blob, filename);

      const tgRes = await axios.post(
        `https://api.telegram.org/bot${TG_TOKEN}/sendDocument`,
        form,
        { timeout: 120_000 }
      );

      const fileId = tgRes.data?.result?.document?.file_id;
      if (!fileId) throw new Error(`لم يُرجع file_id: ${JSON.stringify(tgRes.data).slice(0, 200)}`);
      return `/api/img/${fileId}`;

    } catch (err) {
      lastErr = err;
      const status     = err.response?.status;
      const retryAfter = parseInt(err.response?.data?.parameters?.retry_after ?? "0") || 0;

      if (status === 429) {
        // تليجرام يطلب انتظاراً — نحترمه + نضيف هامش
        const wait = Math.max(retryAfter * 1000, (2 ** attempt) * TG_RETRY_BASE_MS);
        console.warn(`  ⏳  429 Rate Limit — انتظار ${Math.round(wait / 1000)}s (محاولة ${attempt + 1}/${TG_RETRY_COUNT})`);
        await sleep(wait);
      } else if (attempt < TG_RETRY_COUNT - 1) {
        await sleep((2 ** attempt) * TG_RETRY_BASE_MS);
      }
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE UPLOAD — متوازي بدفعات PAGE_CONCURRENCY
// ─────────────────────────────────────────────────────────────────────────────

async function uploadPagesParallel(chapterId, imageUrls, chapterUrl) {
  let success = 0, failed = 0;

  for (let i = 0; i < imageUrls.length; i += PAGE_CONCURRENCY) {
    const batch = imageUrls.slice(i, i + PAGE_CONCURRENCY);

    await Promise.all(batch.map(async (url, j) => {
      const pageNum = i + j + 1;

      if (DRY_RUN) {
        console.log(`     [dry] ص${pageNum}: ${url.slice(0, 90)}`);
        success++;
        return;
      }

      try {
        const tgUrl = await uploadImageToTelegram(url, chapterUrl);
        await insertPage(chapterId, pageNum, tgUrl);
        success++;
      } catch (e) {
        console.error(`     ص${pageNum} ❌  ${e.message.slice(0, 80)}`);
        // Fallback: حفظ الرابط المباشر حتى لا نخسر الصفحة
        try {
          await insertPage(chapterId, pageNum, url);
          console.warn(`     ص${pageNum} ⚠️  حُفظ كرابط مباشر (للمزامنة لاحقاً)`);
          success++;
        } catch {
          failed++;
        }
      }
    }));

    // تأخير بين الدفعات لتجنب 429
    if (i + PAGE_CONCURRENCY < imageUrls.length) {
      await new Promise(r => setTimeout(r, PAGE_BATCH_DELAY_MS));
    }

    const done = Math.min(i + PAGE_CONCURRENCY, imageUrls.length);
    process.stdout.write(`\r     📤  [${done}/${imageUrls.length}] صفحة مرفوعة`);
  }
  console.log(); // سطر جديد بعد شريط التقدم
  return { success, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT ONE CHAPTER
// ─────────────────────────────────────────────────────────────────────────────

async function importChapter(manga, chapterNum, baseUrl, autoPublish) {
  const chapterUrl = buildChapterUrl(baseUrl, chapterNum);
  const label      = `[فصل ${chapterNum}]`;
  console.log(`\n${label} ── ${chapterUrl}`);

  // تحقق من وجود الفصل مسبقاً
  const existing = await chapterExists(manga.id, chapterNum);
  if (existing) {
    console.log(`  ⏭️   موجود مسبقاً (id=${existing.id}) — تخطّي`);
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
  let imageUrls = extractImages(html, chapterUrl);
  if (imageUrls.length === 0) {
    console.log(`  ⚠️   لا صور بالـ selectors العادية — تجربة وضع ts_reader…`);
    imageUrls = await extractImagesFromOgAndEnumerate(html, chapterUrl);
  }
  if (imageUrls.length === 0) {
    console.error(`  ❌  لم يُعثر على صور — قد يكون الموقع يحمي محتواه`);
    return { failed: true };
  }
  console.log(`  🖼️   عدد الصفحات: ${imageUrls.length}`);

  if (DRY_RUN) {
    await uploadPagesParallel(null, imageUrls, chapterUrl); // dry run فقط
    return { dryRun: true };
  }

  // إنشاء الفصل في DB
  const chapterStatus = autoPublish ? "published" : "pending";
  const chapterId = await createChapter(manga.id, chapterNum, chapterStatus);
  console.log(`  ✅  أُنشئ الفصل في DB (id=${chapterId})`);

  // رفع الصور بالتوازي
  const { success, failed } = await uploadPagesParallel(chapterId, imageUrls, chapterUrl);
  console.log(`  📊  ${success} صفحة / ${failed} فشلت`);

  return { chapterId, pageSuccess: success, pageFailed: failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE FILE
// ─────────────────────────────────────────────────────────────────────────────

const QUEUE_FILE = path.join(__dirname, "manga-queue.json");

function readQueue() {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
  } catch {
    console.error("❌  خطأ في قراءة manga-queue.json");
    return [];
  }
}

function writeQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2) + "\n", "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// CONCURRENT CHAPTER PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * يعالج قائمة أرقام الفصول بالتوازي (CHAPTER_CONCURRENCY فصول في الوقت ذاته).
 */
async function importChaptersConcurrently(manga, chapterNums, baseUrl, autoPublish) {
  const stats = { imported: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < chapterNums.length; i += CHAPTER_CONCURRENCY) {
    const batch = chapterNums.slice(i, i + CHAPTER_CONCURRENCY);

    const results = await Promise.all(
      batch.map(n => importChapter(manga, n, baseUrl, autoPublish))
    );

    for (const r of results) {
      if (r.skipped)      stats.skipped++;
      else if (r.failed)  stats.failed++;
      else                stats.imported++;
    }

    // تأخير بسيط بين دفعات الفصول (ليس بين الصفحات)
    if (i + CHAPTER_CONCURRENCY < chapterNums.length && DELAY_SEC > 0) {
      await new Promise(r => setTimeout(r, DELAY_SEC * 1000));
    }
  }

  return stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE MODE
// ─────────────────────────────────────────────────────────────────────────────

async function runQueueMode() {
  const queue = readQueue();

  if (queue.length === 0) {
    console.log("📭  القائمة فارغة — لا يوجد عمل");
    return;
  }

  // ابحث عن أول مانغا نشطة (active/pending)
  const idx    = queue.findIndex(e => e.status === "active" || e.status === "pending");
  const entry  = idx >= 0 ? queue[idx] : null;

  if (!entry) {
    console.log("📭  جميع المانغا مكتملة أو موقوفة — لا يوجد عمل");
    return;
  }

  // البحث عن المانغا في DB
  let manga;
  if (entry.mangaId) {
    manga = await findMangaById(parseInt(entry.mangaId));
  } else {
    const results = await findMangaByName(entry.mangaName);
    if (results.length === 0) {
      console.error(`❌  لم تُوجد المانغا في DB: "${entry.mangaName}"`);
      console.error(`    تأكد من إضافتها أولاً من لوحة التحكم`);
      return;
    }
    if (results.length > 1) {
      console.log(`⚠️  أكثر من نتيجة لـ "${entry.mangaName}" — سأستخدم: #${results[0].id} ${results[0].title}`);
    }
    manga = results[0];
  }

  const totalChapters  = entry.totalChapters ?? Infinity;
  const maxImported    = await getMaxImportedChapter(manga.id);
  const nextChapter    = maxImported + 1;

  if (nextChapter > totalChapters) {
    console.log(`🎉  "${manga.title}" — جميع الفصول (${totalChapters}) مكتملة`);
    queue[idx].status = "completed";
    writeQueue(queue);
    return;
  }

  const endChapter   = Math.min(nextChapter + BATCH_LIMIT - 1, totalChapters);
  const chapterNums  = Array.from({ length: endChapter - nextChapter + 1 }, (_, i) => nextChapter + i);
  const autoPublish  = entry.autoPublish ?? true;
  const baseUrl      = entry.baseUrl;

  console.log("══════════════════════════════════════════════════════");
  console.log(`  RTN Manga — Queue Import`);
  console.log(`  ${new Date().toISOString()}`);
  if (DRY_RUN) console.log("  🔍  وضع المعاينة — لن يتم حفظ أي بيانات");
  console.log("══════════════════════════════════════════════════════");
  console.log(`📚  "${manga.title}" (id=${manga.id})`);
  console.log(`📡  الفصول: ${nextChapter} → ${endChapter} (من أصل ${totalChapters})`);
  console.log(`⚡  تزامن الفصول: ${CHAPTER_CONCURRENCY} | تزامن الصفحات: ${PAGE_CONCURRENCY}`);
  console.log(`🔗  الرابط: ${baseUrl}`);
  console.log();

  // تغيير الحالة إلى in-progress
  queue[idx].status = "in-progress";
  writeQueue(queue);

  const stats = await importChaptersConcurrently(manga, chapterNums, baseUrl, autoPublish);

  // إعادة فحص الحالة
  const newMax = await getMaxImportedChapter(manga.id);
  if (newMax >= totalChapters) {
    queue[idx].status = "completed";
    console.log(`\n🎉  "${manga.title}" — اكتمال جميع الفصول!`);
  } else {
    queue[idx].status = "active";
  }
  writeQueue(queue);

  printStats(stats, endChapter - nextChapter + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL MODE (الوضع اليدوي — متوافق مع الإصدار السابق)
// ─────────────────────────────────────────────────────────────────────────────

async function runManualMode() {
  console.log("══════════════════════════════════════════════════════");
  console.log("  RTN Manga — Chapter Importer");
  console.log(`  ${new Date().toISOString()}`);
  if (DRY_RUN) console.log("  🔍  وضع المعاينة — لن يتم حفظ أي بيانات");
  console.log("══════════════════════════════════════════════════════");

  // إيجاد المانغا
  let manga;
  if (MANGA_ID) {
    manga = await findMangaById(MANGA_ID);
    if (!manga) { console.error(`❌  لا توجد مانغا برقم ${MANGA_ID}`); await pool.end(); process.exit(1); }
  } else {
    const results = await findMangaByName(MANGA_NAME);
    if (results.length === 0) {
      console.error(`❌  لا توجد مانغا باسم "${MANGA_NAME}"`);
      await pool.end(); process.exit(1);
    }
    if (results.length > 1) {
      console.log(`⚠️  أكثر من نتيجة — سأستخدم: #${results[0].id} ${results[0].title}`);
      console.log(`    حدد الرقم مباشرة بـ --manga-id=X لتجنب الغموض`);
    }
    manga = results[0];
  }

  console.log(`\n📚  "${manga.title}" (id=${manga.id})`);
  console.log(`📡  من فصل ${START} إلى فصل ${END}`);
  console.log(`⚡  تزامن الفصول: ${CHAPTER_CONCURRENCY} | تزامن الصفحات: ${PAGE_CONCURRENCY}`);
  console.log(`⏱️   تأخير بين دفعات الفصول: ${DELAY_SEC}s`);
  console.log(`🚀  النشر التلقائي: ${AUTO_PUBLISH ? "مفعّل" : "معطّل"}`);
  console.log(`🔗  نمط الرابط: ${BASE_URL}`);
  console.log();

  const chapterNums = Array.from({ length: END - START + 1 }, (_, i) => START + i);
  const stats = await importChaptersConcurrently(manga, chapterNums, BASE_URL, AUTO_PUBLISH);

  printStats(stats, END - START + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function printStats(stats, total) {
  console.log("\n══════════════════════════════════════════════════════");
  console.log(`  النتيجة: ${total} فصل`);
  console.log(`  ✅  تم استيرادها:  ${stats.imported}`);
  console.log(`  ⏭️   موجودة مسبقاً: ${stats.skipped}`);
  console.log(`  ❌  فشلت:          ${stats.failed}`);
  console.log("══════════════════════════════════════════════════════");
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (QUEUE_MODE) {
    await runQueueMode();
  } else {
    await runManualMode();
  }
  await pool.end();
}

main().catch(err => {
  console.error("خطأ فادح:", err.message);
  pool.end().finally(() => process.exit(1));
});
