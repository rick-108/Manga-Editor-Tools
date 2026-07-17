import { Router, type IRouter } from "express";
import { eq, and, asc, sql } from "drizzle-orm";
import { db, pagesTable } from "@workspace/db";
import { ReorderPagesBody } from "@workspace/api-zod";
import { requirePublisher } from "../middlewares/publisher";
import { storeUploadedFile, uploadsDir } from "../lib/storage";
import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => { cb(null, uploadsDir); },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) { cb(null, true); }
    else { cb(new Error("Only image files are allowed")); }
  },
});

const router: IRouter = Router();

router.get("/manga/:mangaId/chapters/:chapterId/pages", async (req, res): Promise<void> => {
  const rawMangaId = Array.isArray(req.params.mangaId) ? req.params.mangaId[0] : req.params.mangaId;
  const rawChapterId = Array.isArray(req.params.chapterId) ? req.params.chapterId[0] : req.params.chapterId;
  const mangaId = parseInt(rawMangaId, 10);
  const chapterId = parseInt(rawChapterId, 10);

  if (isNaN(mangaId) || isNaN(chapterId)) { res.status(400).json({ error: "Invalid parameters" }); return; }

  const pages = await db.select().from(pagesTable).where(eq(pagesTable.chapterId, chapterId)).orderBy(asc(pagesTable.pageNumber));
  res.json(pages.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })));
});

// رفع صفحات الفصل — كل الصور تذهب حصراً إلى Telegram
router.post(
  "/manga/:mangaId/chapters/:chapterId/pages/upload",
  requirePublisher,
  upload.array("pages", 500),
  async (req, res): Promise<void> => {
    const rawMangaId = Array.isArray(req.params.mangaId) ? req.params.mangaId[0] : req.params.mangaId;
    const rawChapterId = Array.isArray(req.params.chapterId) ? req.params.chapterId[0] : req.params.chapterId;
    const mangaId = parseInt(rawMangaId, 10);
    const chapterId = parseInt(rawChapterId, 10);

    if (isNaN(mangaId) || isNaN(chapterId)) { res.status(400).json({ error: "Invalid parameters" }); return; }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) { res.status(400).json({ error: "No files uploaded" }); return; }

    const [maxPage] = await db
      .select({ max: sql<number>`COALESCE(MAX(page_number), 0)` })
      .from(pagesTable)
      .where(eq(pagesTable.chapterId, chapterId));

    let startPageNumber = Number(maxPage?.max ?? 0) + 1;

    const insertedPages = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pageNumber = startPageNumber + i;
      // يرفع الصورة إلى Telegram ويُرجع رابط /api/img/{fileId}
      const imageUrl = await storeUploadedFile(file.path, file.filename);
      const [page] = await db.insert(pagesTable).values({ chapterId, pageNumber, imageUrl }).returning();
      insertedPages.push({ ...page, createdAt: page.createdAt.toISOString() });
    }

    res.status(201).json({ pages: insertedPages, storage: "telegram" });
  }
);

// رفع غلاف المانغا — يمر عبر Telegram أيضاً
router.post(
  "/uploads/cover",
  requirePublisher,
  upload.single("cover"),
  async (req, res): Promise<void> => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const imageUrl = await storeUploadedFile(file.path, file.filename);
    res.json({ url: imageUrl, storage: "telegram" });
  }
);

router.post("/manga/:mangaId/chapters/:chapterId/pages/reorder", requirePublisher, async (req, res): Promise<void> => {
  const rawChapterId = Array.isArray(req.params.chapterId) ? req.params.chapterId[0] : req.params.chapterId;
  const chapterId = parseInt(rawChapterId, 10);
  if (isNaN(chapterId)) { res.status(400).json({ error: "Invalid parameters" }); return; }

  const parsed = ReorderPagesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { pageIds } = parsed.data;
  for (let i = 0; i < pageIds.length; i++) {
    await db
      .update(pagesTable)
      .set({ pageNumber: i + 1 })
      .where(and(eq(pagesTable.id, pageIds[i]), eq(pagesTable.chapterId, chapterId)));
  }

  const pages = await db.select().from(pagesTable).where(eq(pagesTable.chapterId, chapterId)).orderBy(asc(pagesTable.pageNumber));
  res.json(pages.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })));
});

router.delete("/manga/:mangaId/chapters/:chapterId/pages/:pageId", requirePublisher, async (req, res): Promise<void> => {
  const rawPageId = Array.isArray(req.params.pageId) ? req.params.pageId[0] : req.params.pageId;
  const rawChapterId = Array.isArray(req.params.chapterId) ? req.params.chapterId[0] : req.params.chapterId;
  const pageId = parseInt(rawPageId, 10);
  const chapterId = parseInt(rawChapterId, 10);

  if (isNaN(pageId) || isNaN(chapterId)) { res.status(400).json({ error: "Invalid parameters" }); return; }

  const [deleted] = await db
    .delete(pagesTable)
    .where(and(eq(pagesTable.id, pageId), eq(pagesTable.chapterId, chapterId)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Page not found" }); return; }

  // الصور على Telegram — لا يوجد ملف محلي لحذفه
  res.sendStatus(204);
});

export default router;
