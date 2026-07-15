import { Router, type IRouter } from "express";
import { eq, desc, and, asc, sql } from "drizzle-orm";
import { db, mangaTable, chaptersTable, pagesTable } from "@workspace/db";
import { CreateChapterBody } from "@workspace/api-zod";
import { requirePublisher } from "../middlewares/publisher";

const router: IRouter = Router();

router.get("/manga/:mangaId/chapters", async (req, res): Promise<void> => {
  const rawMangaId = Array.isArray(req.params.mangaId) ? req.params.mangaId[0] : req.params.mangaId;
  const mangaId = parseInt(rawMangaId, 10);
  if (isNaN(mangaId)) { res.status(400).json({ error: "Invalid mangaId" }); return; }

  const chapters = await db
    .select()
    .from(chaptersTable)
    .where(eq(chaptersTable.mangaId, mangaId))
    .orderBy(asc(chaptersTable.number));

  const chaptersWithPageCount = await Promise.all(
    chapters.map(async (ch) => {
      const [pc] = await db.select({ count: sql<number>`count(*)` }).from(pagesTable).where(eq(pagesTable.chapterId, ch.id));
      return {
        ...ch,
        pageCount: Number(pc?.count ?? 0),
        createdAt: ch.createdAt.toISOString(),
        publishedAt: ch.publishedAt?.toISOString() ?? null,
      };
    })
  );

  res.json(chaptersWithPageCount);
});

router.post("/manga/:mangaId/chapters", requirePublisher, async (req, res): Promise<void> => {
  const rawMangaId = Array.isArray(req.params.mangaId) ? req.params.mangaId[0] : req.params.mangaId;
  const mangaId = parseInt(rawMangaId, 10);
  if (isNaN(mangaId)) { res.status(400).json({ error: "Invalid mangaId" }); return; }

  const parsed = CreateChapterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const publisherId = (req as any).publisherId ?? "publisher";

  const [chapter] = await db
    .insert(chaptersTable)
    .values({ mangaId, number: parsed.data.number, title: parsed.data.title ?? null, status: "pending", publisherId })
    .returning();

  res.status(201).json({ ...chapter, pageCount: 0, createdAt: chapter.createdAt.toISOString(), publishedAt: null });
});

router.get("/manga/:mangaId/chapters/:chapterId", async (req, res): Promise<void> => {
  const rawMangaId = Array.isArray(req.params.mangaId) ? req.params.mangaId[0] : req.params.mangaId;
  const rawChapterId = Array.isArray(req.params.chapterId) ? req.params.chapterId[0] : req.params.chapterId;
  const mangaId = parseInt(rawMangaId, 10);
  const chapterId = parseInt(rawChapterId, 10);

  if (isNaN(mangaId) || isNaN(chapterId)) { res.status(400).json({ error: "Invalid parameters" }); return; }

  const [chapter] = await db
    .select()
    .from(chaptersTable)
    .where(and(eq(chaptersTable.id, chapterId), eq(chaptersTable.mangaId, mangaId)));

  if (!chapter) { res.status(404).json({ error: "Chapter not found" }); return; }

  const [manga] = await db.select().from(mangaTable).where(eq(mangaTable.id, mangaId));
  const pages = await db.select().from(pagesTable).where(eq(pagesTable.chapterId, chapterId)).orderBy(asc(pagesTable.pageNumber));

  const [chapterCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chaptersTable)
    .where(and(eq(chaptersTable.mangaId, mangaId), eq(chaptersTable.status, "published")));

  res.json({
    ...chapter,
    createdAt: chapter.createdAt.toISOString(),
    publishedAt: chapter.publishedAt?.toISOString() ?? null,
    pages: pages.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
    manga: manga ? { ...manga, chapterCount: Number(chapterCount?.count ?? 0) } : null,
  });
});

router.delete("/manga/:mangaId/chapters/:chapterId", requirePublisher, async (req, res): Promise<void> => {
  const rawMangaId = Array.isArray(req.params.mangaId) ? req.params.mangaId[0] : req.params.mangaId;
  const rawChapterId = Array.isArray(req.params.chapterId) ? req.params.chapterId[0] : req.params.chapterId;
  const mangaId = parseInt(rawMangaId, 10);
  const chapterId = parseInt(rawChapterId, 10);

  if (isNaN(mangaId) || isNaN(chapterId)) { res.status(400).json({ error: "Invalid parameters" }); return; }

  const [deleted] = await db
    .delete(chaptersTable)
    .where(and(eq(chaptersTable.id, chapterId), eq(chaptersTable.mangaId, mangaId)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Chapter not found" }); return; }
  res.sendStatus(204);
});

router.post("/manga/:mangaId/chapters/:chapterId/publish", requirePublisher, async (req, res): Promise<void> => {
  const rawMangaId = Array.isArray(req.params.mangaId) ? req.params.mangaId[0] : req.params.mangaId;
  const rawChapterId = Array.isArray(req.params.chapterId) ? req.params.chapterId[0] : req.params.chapterId;
  const mangaId = parseInt(rawMangaId, 10);
  const chapterId = parseInt(rawChapterId, 10);

  if (isNaN(mangaId) || isNaN(chapterId)) { res.status(400).json({ error: "Invalid parameters" }); return; }

  const [chapter] = await db
    .update(chaptersTable)
    .set({ status: "published", publishedAt: new Date() })
    .where(and(eq(chaptersTable.id, chapterId), eq(chaptersTable.mangaId, mangaId)))
    .returning();

  if (!chapter) { res.status(404).json({ error: "Chapter not found" }); return; }

  await db.update(mangaTable).set({ updatedAt: new Date() }).where(eq(mangaTable.id, mangaId));

  const [pc] = await db.select({ count: sql<number>`count(*)` }).from(pagesTable).where(eq(pagesTable.chapterId, chapterId));

  res.json({
    ...chapter,
    pageCount: Number(pc?.count ?? 0),
    createdAt: chapter.createdAt.toISOString(),
    publishedAt: chapter.publishedAt?.toISOString() ?? null,
  });
});

export default router;
