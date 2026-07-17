/**
 * GET /api/img/:fileId
 *
 * Proxy لملفات Telegram — يخفي التوكن عن العميل ويُضيف cache لتقليل طلبات API.
 * - file_id دائم → يمكن إعادة جلب الرابط في أي وقت
 * - نُخزّن الرابط مؤقتاً 50 دقيقة (روابط Telegram تدوم ~ساعة)
 */

import { Router, type IRouter } from "express";
import axios from "axios";

const router: IRouter = Router();

interface CacheEntry { url: string; expiresAt: number }
const urlCache = new Map<string, CacheEntry>();

const CACHE_TTL_MS = 50 * 60 * 1000; // 50 دقيقة

router.get("/img/:fileId", async (req, res): Promise<void> => {
  const { fileId } = req.params;
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    res.status(503).json({ error: "TELEGRAM_BOT_TOKEN غير مضبوط" });
    return;
  }

  // تحقق من الـ cache أولاً
  const cached = urlCache.get(fileId);
  if (cached && cached.expiresAt > Date.now()) {
    res.redirect(302, cached.url);
    return;
  }

  try {
    const result = await axios.post<any>(
      `https://api.telegram.org/bot${token}/getFile`,
      { file_id: fileId },
      { timeout: 10_000 }
    );

    const filePath: string | undefined = result.data?.result?.file_path;
    if (!filePath) {
      res.status(404).json({ error: "الملف غير موجود على Telegram" });
      return;
    }

    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

    // احفظ في الـ cache
    urlCache.set(fileId, { url: fileUrl, expiresAt: Date.now() + CACHE_TTL_MS });

    // أرسل هيدر Cache-Control حتى المتصفح يُخزّن هو الآخر
    res.setHeader("Cache-Control", "public, max-age=3000");
    res.redirect(302, fileUrl);
  } catch (err: any) {
    const status = err?.response?.data?.error_code ?? 500;
    const description = err?.response?.data?.description ?? err?.message ?? "خطأ غير معروف";
    res.status(status < 600 ? status : 500).json({ error: description });
  }
});

export default router;
