import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, pagesTable, chaptersTable } from "@workspace/db";
import { RemotePreviewBody } from "@workspace/api-zod";
import { requirePublisher } from "../middlewares/publisher";
import { storeRemoteImage } from "../lib/storage";
import axios from "axios";
import * as cheerio from "cheerio";
import { randomUUID } from "crypto";

// ─────────────────────────────────────────────
// JOB STORE (in-memory)
// ─────────────────────────────────────────────

export type JobStatus = "pending" | "fetching" | "downloading" | "done" | "error";

export interface ImportJob {
  id: string;
  status: JobStatus;
  error?: string;
  chapterId: number;
  mangaId: number;
  pageSourceUrl: string;
  total: number;
  downloaded: number;
  /** pages that failed — kept for retry */
  failed: Array<{ index: number; url: string }>;
  startedAt: number;
  /** page number offset so retry can recalculate the correct DB page_number */
  startPageNumber: number;
  /** if true, chapter is published automatically when job finishes successfully */
  autoPublish: boolean;
}

const jobs = new Map<string, ImportJob>();

function addJob(job: ImportJob) {
  if (jobs.size >= 100) {
    const oldest = [...jobs.keys()][0];
    jobs.delete(oldest);
  }
  jobs.set(job.id, job);
}

// ─────────────────────────────────────────────
// CONCURRENCY HELPER
// ─────────────────────────────────────────────

/**
 * Run `tasks` (functions returning Promises) with at most `limit` running simultaneously.
 * Results are returned in the same order as input tasks.
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      results[i] = await tasks[i]();
    }
  }

  const pool = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(pool);
  return results;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function getOrigin(url: string): string {
  try { return new URL(url).origin; } catch { return ""; }
}

function buildHeaders(url: string, extra: Record<string, string> = {}) {
  const origin = getOrigin(url);
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": origin + "/",
    "Origin": origin,
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "max-age=0",
    "Connection": "keep-alive",
    ...extra,
  };
}

function toAbs(src: string, base: string): string | null {
  if (!src || src.startsWith("data:") || src.length < 5) return null;
  src = src.trim().replace(/\\\//g, "/");
  if (src.startsWith("//")) return "https:" + src;
  if (src.startsWith("http")) return src;
  try { return new URL(src, base).href; } catch { return null; }
}

function dedupe(arr: string[]): string[] { return [...new Set(arr)]; }

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif|bmp)(\?[^"'<>\s]*)?$/i;
const UI_BLACKLIST = /logo|icon|avatar|banner|sprite|placeholder|loading|spinner|blank|ad[_\-]|\/ads?\/|noimage|default\.(png|jpe?g)|thumbnail[_\-]small|favicon|emoji|button|social|share|arrow|close|menu|header|footer|navbar|sidebar/i;

function isMangaPage(url: string): boolean {
  return !!(url?.startsWith("http") && !UI_BLACKLIST.test(url));
}

// ─────────────────────────────────────────────
// EXTRACTION STRATEGIES
// ─────────────────────────────────────────────

function extractTsReader(html: string, base: string): string[] {
  const m = html.match(/ts_reader\.run\s*\(\s*(\{[\s\S]*?\})\s*\)/);
  if (!m) return [];
  try {
    const obj = JSON.parse(m[1]);
    const sources: Array<{ images?: string[] }> = obj.sources ?? obj.source ?? [];
    return sources.flatMap(s => (s.images ?? [])
      .map(img => toAbs(img, base))
      .filter((u): u is string => !!u && isMangaPage(u)));
  } catch { return []; }
}

function extractFromJsonBlobs(scripts: string[], base: string): string[] {
  const urls: string[] = [];
  const rx = /"(https?:\/\/[^"\\]{8,600})"|'(https?:\/\/[^'\\]{8,600})'/g;
  for (const script of scripts) {
    let m: RegExpExecArray | null;
    const r = new RegExp(rx.source, rx.flags);
    while ((m = r.exec(script)) !== null) {
      const raw = m[1] || m[2];
      if (IMG_EXT.test(raw) && isMangaPage(raw)) {
        const abs = toAbs(raw, base);
        if (abs) urls.push(abs);
      }
    }
  }
  return urls;
}

function extractJsArrays(scripts: string[], base: string): string[] {
  const urls: string[] = [];
  const varPatterns = [
    /sources\s*:\s*\[[\s\S]*?images\s*:\s*(\[[\s\S]*?\])/g,
    /(?:var|let|const)\s+(?:\w*[Pp]age\w*|\w*[Ii]mage\w*|\w*[Cc]hapter\w*)\s*=\s*(\[[^\]]{8,}\])/g,
    /window\s*\.\s*\w+\s*=\s*(\[[\s\S]{8,500}?\])/g,
    /"(?:images|pages|imgs|chapter_images|chapterImages|page_images)"\s*:\s*(\[[^\]]{8,}\])/g,
    /\b\w*(?:[Ii]mage|[Pp]age|[Pp]ict)\w*\s*=\s*(\[[\s\S]{8,500}?\])/g,
  ];
  for (const script of scripts) {
    for (const pat of varPatterns) {
      const rx = new RegExp(pat.source, pat.flags);
      let m: RegExpExecArray | null;
      while ((m = rx.exec(script)) !== null) {
        const inner = /"([^"\\]{8,500})"|'([^'\\]{8,500})'/g;
        let im: RegExpExecArray | null;
        while ((im = inner.exec(m[1])) !== null) {
          const abs = toAbs(im[1] || im[2], base);
          if (abs && isMangaPage(abs)) urls.push(abs);
        }
      }
    }
  }
  return urls;
}

function extractAstroNanostores(html: string, base: string): string[] {
  const urls: string[] = [];
  const rx = /\[0\s*,\s*"(https?:\/\/[^"]{10,600})"/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const raw = m[1];
    if (IMG_EXT.test(raw) && isMangaPage(raw)) {
      const abs = toAbs(raw, base);
      if (abs) urls.push(abs);
    }
  }
  return urls;
}

async function extractVcomicsApi(html: string, base: string): Promise<string[]> {
  const chapterIdMatch = html.match(/"chapterId"\s*:\s*\[\s*0\s*,\s*(\d+)\s*\]/);
  if (!chapterIdMatch) return [];
  const chapterId = chapterIdMatch[1];
  const origin = getOrigin(base);
  const endpoints = [
    `${origin}/api/chapters/${chapterId}/pages`,
    `${origin}/api/chapter/${chapterId}/pages`,
    `${origin}/api/chapter-pages/${chapterId}`,
    `${origin}/_vcomics/chapter/${chapterId}/pages`,
  ];
  for (const ep of endpoints) {
    try {
      const res = await axios.get(ep, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json", "Referer": base },
        timeout: 10000,
      });
      if (res.status !== 200 || typeof res.data !== "object") continue;
      const d = res.data;
      for (const arr of [d.pages, d.images, d.data?.pages, d.data?.images, d.chapter?.pages, Array.isArray(d) ? d : null]) {
        if (!Array.isArray(arr)) continue;
        const urls: string[] = [];
        for (const item of arr) {
          const s = typeof item === "string" ? item : item?.url || item?.imageUrl || item?.image_url || item?.src || item?.path;
          if (typeof s === "string") {
            const abs = toAbs(s, base);
            if (abs && IMG_EXT.test(abs) && isMangaPage(abs)) urls.push(abs);
          }
        }
        if (urls.length > 0) return dedupe(urls);
      }
    } catch { }
  }
  return [];
}

function extractHtmlImgs($: cheerio.CheerioAPI, base: string): string[] {
  const selectors = [
    "#readerarea", ".reading-content", "#chapter-images", ".chapter-images",
    ".manga-reader", ".comic-content", ".voldata", ".imgs_page", ".reader-area",
    ".viewer", "article", "#content-manga", ".chapter-reader", ".reader",
    "[class*='reader']", "[class*='chapter']",
  ];
  for (const sel of selectors) {
    const found: string[] = [];
    $(`${sel} img`).each((_i, el) => {
      const raw = $(el).attr("data-src") || $(el).attr("data-lazy-src") || $(el).attr("data-original") || $(el).attr("data-cfsrc") || $(el).attr("src") || "";
      const abs = toAbs(raw, base);
      if (abs && isMangaPage(abs)) found.push(abs);
    });
    if (found.length > 0) return found;
  }
  return [];
}

function extractAllImgs($: cheerio.CheerioAPI, base: string): string[] {
  const urls: string[] = [];
  $("img").each((_i, el) => {
    const raw = $(el).attr("data-src") || $(el).attr("data-lazy-src") || $(el).attr("data-original") || $(el).attr("src") || "";
    const abs = toAbs(raw, base);
    if (abs && IMG_EXT.test(abs) && isMangaPage(abs)) urls.push(abs);
  });
  return urls;
}

function scoreCandidates(candidates: string[][]): string[] {
  const scored = candidates.filter(c => c.length > 0).map(list => {
    const deduped = dedupe(list);
    const domainCounts: Record<string, number> = {};
    deduped.forEach(u => {
      try {
        const x = new URL(u);
        const key = x.hostname + x.pathname.split("/").slice(0, -1).join("/");
        domainCounts[key] = (domainCounts[key] ?? 0) + 1;
      } catch { }
    });
    return { list: deduped, score: Math.max(...Object.values(domainCounts), 0) };
  });
  if (!scored.length) return [];
  scored.sort((a, b) => b.score - a.score);
  return scored[0].list;
}

async function fetchWithBypass(url: string): Promise<string> {
  const attempts = [
    buildHeaders(url),
    {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      "Referer": getOrigin(url) + "/",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    },
  ];
  let lastErr: unknown;
  for (const headers of attempts) {
    try {
      const res = await axios.get(url, {
        headers, timeout: 45000, maxRedirects: 10, responseType: "text",
        validateStatus: (s) => s < 500,
      });
      if (res.status === 200) return res.data as string;
      lastErr = new Error(`الموقع يرفض الطلب (${res.status}) — قد يكون محمياً بـ Cloudflare`);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function fetchPageUrls(url: string): Promise<{
  title: string;
  pageUrls: string[];
  chapterNumber: number | null;
  mangaTitle: string | null;
}> {
  const html = await fetchWithBypass(url);
  const $ = cheerio.load(html);
  const scripts: string[] = [];
  $("script").each((_i, el) => { const t = $(el).html() ?? ""; if (t.length > 10) scripts.push(t); });

  const candidates: string[][] = [];
  const ts = extractTsReader(html, url);       if (ts.length) candidates.push(ts);
  const jb = extractFromJsonBlobs(scripts, url); if (jb.length) candidates.push(jb);
  const ja = extractJsArrays(scripts, url);     if (ja.length) candidates.push(ja);
  if (!candidates.some(c => c.length > 2)) { const h = extractHtmlImgs($, url); if (h.length) candidates.push(h); }
  if (!candidates.some(c => c.length > 2)) { const a = extractAllImgs($, url);  if (a.length) candidates.push(a); }
  if (!candidates.some(c => c.length > 2)) { const n = extractAstroNanostores(html, url); if (n.length) candidates.push(n); }
  if (!candidates.some(c => c.length > 2)) { const v = await extractVcomicsApi(html, url); if (v.length) candidates.push(v); }

  const pageUrls = scoreCandidates(candidates);

  const title = $("title").text().trim() || $("h1").first().text().trim() || "فصل غير محدد";
  let mangaTitle: string | null = null;
  const crumbs = $(".breadcrumb a, .breadcrumbs a, nav a").toArray();
  if (crumbs.length >= 2) mangaTitle = $(crumbs[crumbs.length - 2]).text().trim() || null;
  if (!mangaTitle) mangaTitle = $(".post-title h1, .manga-title, h1.entry-title").first().text().trim() || null;
  if (!mangaTitle) { const m = html.match(/"seriesTitle"\s*:\s*\[\s*0\s*,\s*"([^"]+)"/); if (m) mangaTitle = m[1]; }

  let chapterNumber: number | null = null;
  const acn = html.match(/"chapterNumber"\s*:\s*\[\s*0\s*,\s*([\d.]+)\s*\]/);
  if (acn) chapterNumber = parseFloat(acn[1]);
  else { const um = url.match(/\/(\d+(?:\.\d+)?)\/?(?:\?.*)?$/); if (um) chapterNumber = parseFloat(um[1]); }

  return { title, pageUrls, chapterNumber, mangaTitle };
}

// ─────────────────────────────────────────────
// PARALLEL DOWNLOAD WORKER
// Concurrency: 5 simultaneous uploads.
// Order is guaranteed by using the original array index as the pageNumber offset.
// ─────────────────────────────────────────────

const UPLOAD_CONCURRENCY = 8;

async function runDownloadJob(job: ImportJob, pageUrls: string[], startPageNumber: number) {
  job.status = "downloading";
  job.total = pageUrls.length;
  job.startPageNumber = startPageNumber;

  // Build one task per image — each task knows its final page number
  const tasks = pageUrls.map((imageUrl, i) => async (): Promise<void> => {
    const pageNumber = startPageNumber + i;
    const ext = imageUrl.match(/\.(jpe?g|png|webp|gif|avif)/i)?.[0] ?? ".jpg";
    const filename = `remote-${Date.now()}-${i}${ext}`;
    try {
      const storedUrl = await storeRemoteImage(imageUrl, filename, job.pageSourceUrl);
      if (storedUrl) {
        await db.insert(pagesTable).values({ chapterId: job.chapterId, pageNumber, imageUrl: storedUrl });
        job.downloaded++;
      } else {
        job.failed.push({ index: i, url: imageUrl });
      }
    } catch {
      job.failed.push({ index: i, url: imageUrl });
    }
  });

  await runWithConcurrency(tasks, UPLOAD_CONCURRENCY);
  job.status = "done";
}

async function runRetryJob(job: ImportJob, toRetry: Array<{ index: number; url: string }>) {
  job.status = "downloading";

  const tasks = toRetry.map(({ index, url: imageUrl }) => async (): Promise<void> => {
    // Preserve the original page number so retried pages slot back in the right position
    const pageNumber = job.startPageNumber + index;
    const ext = imageUrl.match(/\.(jpe?g|png|webp|gif|avif)/i)?.[0] ?? ".jpg";
    const filename = `retry-${Date.now()}-${index}${ext}`;
    try {
      const storedUrl = await storeRemoteImage(imageUrl, filename, job.pageSourceUrl);
      if (storedUrl) {
        // Use INSERT ... ON CONFLICT DO UPDATE so we don't duplicate if page_number already exists
        await db
          .insert(pagesTable)
          .values({ chapterId: job.chapterId, pageNumber, imageUrl: storedUrl })
          .onConflictDoUpdate({
            target: [pagesTable.chapterId, pagesTable.pageNumber],
            set: { imageUrl: storedUrl },
          });
        job.downloaded++;
      } else {
        job.failed.push({ index, url: imageUrl });
      }
    } catch {
      job.failed.push({ index, url: imageUrl });
    }
  });

  await runWithConcurrency(tasks, UPLOAD_CONCURRENCY);
  job.status = "done";
}

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

const router: IRouter = Router();

/**
 * POST /api/remote/start-import
 * Creates chapter, kicks off parallel background download, returns jobId immediately.
 */
router.post("/remote/start-import", requirePublisher, async (req, res): Promise<void> => {
  const { url, mangaId, chapterNumber, chapterTitle, autoPublish } = req.body as {
    url: string;
    mangaId: number;
    chapterNumber: number;
    chapterTitle?: string;
    autoPublish?: boolean;
  };

  if (!url || !mangaId || chapterNumber == null) {
    res.status(400).json({ error: "url و mangaId و chapterNumber مطلوبة" });
    return;
  }

  // 1. Create chapter synchronously so we have a chapterId
  let chapterId: number;
  try {
    const [row] = await db
      .insert(chaptersTable)
      .values({ mangaId, number: chapterNumber, title: chapterTitle ?? null, status: "pending" })
      .returning({ id: chaptersTable.id });
    chapterId = row.id;
  } catch (err: any) {
    req.log.error({ err }, "failed to create chapter for remote import");
    res.status(500).json({ error: "فشل إنشاء الفصل: " + err.message });
    return;
  }

  // 2. Create job record
  const jobId = randomUUID();
  const job: ImportJob = {
    id: jobId,
    status: "fetching",
    chapterId,
    mangaId,
    pageSourceUrl: url,
    total: 0,
    downloaded: 0,
    failed: [],
    startedAt: Date.now(),
    startPageNumber: 1,
    autoPublish: autoPublish ?? false,
  };
  addJob(job);

  // 3. Return immediately — browser gets jobId + chapterId right away
  res.json({ jobId, chapterId, mangaId });

  // 4. Run fetch + parallel download in background (no await)
  ;(async () => {
    try {
      job.status = "fetching";
      const { pageUrls } = await fetchPageUrls(url);

      if (pageUrls.length === 0) {
        job.status = "error";
        job.error = "لم يتم العثور على صور الفصل في هذا الرابط";
        return;
      }

      const [maxPage] = await db
        .select({ max: sql<number>`COALESCE(MAX(page_number), 0)` })
        .from(pagesTable)
        .where(eq(pagesTable.chapterId, chapterId));

      const startPage = Number(maxPage?.max ?? 0) + 1;
      await runDownloadJob(job, pageUrls, startPage);

      // Auto-publish if requested and at least some pages succeeded
      if (job.autoPublish && job.downloaded > 0) {
        await db
          .update(chaptersTable)
          .set({ status: "published", publishedAt: new Date() })
          .where(eq(chaptersTable.id, chapterId));
      }
    } catch (err: any) {
      job.status = "error";
      job.error = err?.message ?? "خطأ غير معروف";
    }
  })();
});

/**
 * GET /api/remote/job/:jobId
 * Returns current job progress.
 */
router.get("/remote/job/:jobId", requirePublisher, (req, res): void => {
  const job = jobs.get(req.params.jobId);
  if (!job) { res.status(404).json({ error: "لم يتم العثور على هذا الجاب" }); return; }
  res.json({
    id: job.id,
    status: job.status,
    error: job.error,
    chapterId: job.chapterId,
    mangaId: job.mangaId,
    total: job.total,
    downloaded: job.downloaded,
    failedCount: job.failed.length,
    autoPublish: job.autoPublish,
  });
});

/**
 * POST /api/remote/job/:jobId/retry
 * Re-downloads failed pages at their original page numbers (parallel).
 */
router.post("/remote/job/:jobId/retry", requirePublisher, async (req, res): Promise<void> => {
  const job = jobs.get(req.params.jobId);
  if (!job) { res.status(404).json({ error: "لم يتم العثور على هذا الجاب" }); return; }
  if (job.status === "downloading" || job.status === "fetching") {
    res.status(409).json({ error: "الجاب لا يزال يعمل" }); return;
  }
  if (job.failed.length === 0) {
    res.json({ message: "لا توجد صفحات فاشلة للمعاودة" }); return;
  }

  const toRetry = [...job.failed];
  job.failed = [];

  res.json({ retrying: toRetry.length });

  ;(async () => {
    await runRetryJob(job, toRetry);
    if (job.autoPublish && job.downloaded > 0 && job.failed.length === 0) {
      await db
        .update(chaptersTable)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(chaptersTable.id, job.chapterId));
    }
  })();
});

/**
 * Legacy POST /api/remote/import (kept for backward compat) — parallel version
 */
router.post("/remote/import", requirePublisher, async (req, res): Promise<void> => {
  const { url, chapterId } = req.body as { url: string; chapterId: number };
  if (!url || !chapterId) { res.status(400).json({ error: "url و chapterId مطلوبان" }); return; }
  try {
    const { pageUrls } = await fetchPageUrls(url);
    if (pageUrls.length === 0) {
      res.status(400).json({ success: false, importedPages: 0, message: "لم يتم العثور على صور", errors: [] });
      return;
    }
    const [maxPage] = await db
      .select({ max: sql<number>`COALESCE(MAX(page_number), 0)` })
      .from(pagesTable).where(eq(pagesTable.chapterId, chapterId));
    const start = Number(maxPage?.max ?? 0) + 1;

    let imported = 0;
    const errors: string[] = [];

    const tasks = pageUrls.map((imageUrl, i) => async () => {
      const ext = imageUrl.match(/\.(jpe?g|png|webp|gif|avif)/i)?.[0] ?? ".jpg";
      const fn = `remote-${Date.now()}-${i}${ext}`;
      const stored = await storeRemoteImage(imageUrl, fn, url);
      if (stored) {
        await db.insert(pagesTable).values({ chapterId, pageNumber: start + i, imageUrl: stored });
        imported++;
      } else {
        errors.push(`فشل تحميل الصفحة ${i + 1}`);
      }
    });

    await runWithConcurrency(tasks, UPLOAD_CONCURRENCY);
    res.json({ success: imported > 0, importedPages: imported, message: `تم استيراد ${imported} صفحة`, errors });
  } catch (err: any) {
    req.log.error({ err }, "legacy remote import failed");
    res.status(400).json({ success: false, importedPages: 0, message: err.message, errors: [] });
  }
});

/**
 * POST /api/remote/preview
 */
router.post("/remote/preview", requirePublisher, async (req, res): Promise<void> => {
  const parsed = RemotePreviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const { title, pageUrls, chapterNumber, mangaTitle } = await fetchPageUrls(parsed.data.url);
    res.json({ title, pageCount: pageUrls.length, pageUrls, chapterNumber, mangaTitle });
  } catch (err: any) {
    req.log.error({ err }, "remote preview failed");
    res.status(400).json({ error: `فشل في جلب الصفحات: ${err.message}` });
  }
});

export default router;
