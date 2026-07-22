#!/usr/bin/env node
/**
 * telegram-uploader.mjs
 *
 * Background worker يرفع جميع صفحات المانغا المنتظرة إلى Telegram.
 * يعمل مستقلاً بدون Express أو TypeScript — فقط Node.js 20 + pg + axios.
 *
 * المتطلبات (environment variables):
 *   NEON_DATABASE_URL    — رابط قاعدة البيانات
 *   TELEGRAM_BOT_TOKEN   — توكن البوت
 *   TELEGRAM_CHANNEL_ID  — معرّف القناة (سالب)
 *
 * الاستخدام:
 *   node scripts/telegram-uploader.mjs
 *   node scripts/telegram-uploader.mjs --manga-id=5       (فلترة بمانغا معينة)
 *   node scripts/telegram-uploader.mjs --chapter-id=42    (فلترة بفصل معين)
 *   node scripts/telegram-uploader.mjs --dry-run          (عرض فقط بدون رفع)
 */

import pg from "pg";
import axios from "axios";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE   = 3;       // صفحات متزامنة في كل دفعة
const BATCH_DELAY  = 1500;    // ms بين الدفعات (أكثر تحفظاً من السيرفر)
const RETRY_COUNT  = 3;       // عدد المحاولات لكل صورة
const RETRY_DELAY  = 2000;    // ms بين المحاولات

// ─────────────────────────────────────────────────────────────────────────────
// ARGS
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name) => {
  const found = args.find(a => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : null;
};
const DRY_RUN    = process.env.IMPORTER_DRY_RUN === "true" || args.includes("--dry-run");
const MANGA_ID   = process.env.IMPORTER_MANGA_ID
                     ? parseInt(process.env.IMPORTER_MANGA_ID)
                     : getArg("manga-id") ? parseInt(getArg("manga-id")) : null;
const CHAPTER_ID = getArg("chapter-id") ? parseInt(getArg("chapter-id")) : null;

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

const DB_URL    = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
const TG_TOKEN  = process.env.TELEGRAM_BOT_TOKEN?.trim();
const TG_CHAN   = process.env.TELEGRAM_CHANNEL_ID?.trim();

if (!DB_URL)   { console.error("❌  NEON_DATABASE_URL غير موجود"); process.exit(1); }
if (!TG_TOKEN) { console.error("❌  TELEGRAM_BOT_TOKEN غير موجود"); process.exit(1); }
if (!TG_CHAN)  { console.error("❌  TELEGRAM_CHANNEL_ID غير موجود"); process.exit(1); }

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────────────────────────────────────

const { Pool } = pg;
const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function fetchPendingPages() {
  let query = `
    SELECT p.id, p.chapter_id, p.page_number, p.image_url,
           c.manga_id, c.number AS chapter_number
    FROM pages p
    JOIN chapters c ON c.id = p.chapter_id
    WHERE p.image_url LIKE 'http%'
  `;
  const params = [];

  if (CHAPTER_ID) {
    params.push(CHAPTER_ID);
    query += ` AND p.chapter_id = $${params.length}`;
  } else if (MANGA_ID) {
    params.push(MANGA_ID);
    query += ` AND c.manga_id = $${params.length}`;
  }

  query += ` ORDER BY c.manga_id, p.chapter_id, p.page_number`;

  const { rows } = await pool.query(query, params);
  return rows;
}

async function updatePageUrl(pageId, telegramUrl) {
  await pool.query(
    "UPDATE pages SET image_url = $1 WHERE id = $2",
    [telegramUrl, pageId]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM
// ─────────────────────────────────────────────────────────────────────────────

function mimeFromExt(filename) {
  const ext = path.extname(filename).toLowerCase();
  return { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
           ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
           ".bmp": "image/bmp" }[ext] ?? "image/jpeg";
}

async function uploadBufferToTelegram(buffer, filename) {
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
  if (!fileId) {
    throw new Error(`Telegram لم يُرجع file_id: ${JSON.stringify(res.data).slice(0, 200)}`);
  }
  return `/api/img/${fileId}`;
}

async function downloadAndUpload(imageUrl, filename, referer) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  let origin = "";
  try { origin = new URL(referer || imageUrl).origin; } catch {}

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
    "Referer": referer || origin + "/",
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
        validateStatus: (s) => s < 400,
      });

      const buffer = Buffer.from(imgRes.data);
      if (buffer.length < 1024) {
        lastErr = new Error(`الصورة صغيرة جداً (${buffer.length} bytes) — ربما placeholder`);
        continue;
      }
      return await uploadBufferToTelegram(buffer, filename);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  RTN Manga — Telegram Uploader Worker");
  console.log(`  ${new Date().toISOString()}`);
  if (DRY_RUN)    console.log("  🔍  وضع المعاينة — لن يتم الرفع الفعلي");
  if (MANGA_ID)   console.log(`  فلترة: مانغا #${MANGA_ID}`);
  if (CHAPTER_ID) console.log(`  فلترة: فصل #${CHAPTER_ID}`);
  console.log("═══════════════════════════════════════════════════\n");

  const pages = await fetchPendingPages();

  if (pages.length === 0) {
    console.log("✅  لا توجد صفحات منتظرة — كل شيء مرفوع على Telegram.");
    await pool.end();
    return;
  }

  console.log(`📋  ${pages.length} صفحة تحتاج رفعاً إلى Telegram\n`);

  let success = 0;
  let failed  = 0;
  const failures = [];

  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    const batch = pages.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (page) => {
      const ext      = (page.image_url.match(/\.(jpe?g|png|webp|gif|avif|bmp)/i) || [])[0] ?? ".jpg";
      const filename = `tg-${page.chapter_id}-${page.page_number}${ext}`;
      const label    = `مانغا#${page.manga_id} فصل${page.chapter_number} صفحة${page.page_number}`;

      if (DRY_RUN) {
        console.log(`  [dry-run] ${label} → ${page.image_url.slice(0, 80)}`);
        success++;
        return;
      }

      try {
        const telegramUrl = await downloadAndUpload(page.image_url, filename, page.image_url);
        await updatePageUrl(page.id, telegramUrl);
        console.log(`  ✅  ${label} → ${telegramUrl}`);
        success++;
      } catch (err) {
        console.error(`  ❌  ${label} — ${err.message}`);
        failed++;
        failures.push({ page_id: page.id, manga_id: page.manga_id,
                        chapter_id: page.chapter_id, page_number: page.page_number,
                        url: page.image_url, error: err.message });
      }
    }));

    // تقدم بعد كل دفعة
    const done = Math.min(i + BATCH_SIZE, pages.length);
    const pct  = Math.round((done / pages.length) * 100);
    console.log(`  ← [${done}/${pages.length}] ${pct}%`);

    if (i + BATCH_SIZE < pages.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  // ── ملخص ──────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════");
  console.log(`  ✅  نجح:  ${success}`);
  console.log(`  ❌  فشل:  ${failed}`);
  console.log("═══════════════════════════════════════════════════");

  if (failures.length > 0) {
    console.log("\nالصفحات الفاشلة:");
    failures.forEach(f => {
      console.log(`  - page_id=${f.page_id} (مانغا#${f.manga_id} فصل#${f.chapter_id} ص${f.page_number}): ${f.error}`);
    });
  }

  await pool.end();

  // يُفشل الـ workflow إذا كان هناك صفحات فاشلة (يظهر في GH Actions)
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error("خطأ فادح:", err.message);
  pool.end().finally(() => process.exit(1));
});
