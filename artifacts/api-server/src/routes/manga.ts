import { Router, type IRouter } from "express";
import { eq, ilike, desc, sql, and } from "drizzle-orm";
import { db, mangaTable, chaptersTable } from "@workspace/db";
import {
  ListMangaQueryParams,
  CreateMangaBody,
  UpdateMangaBody,
} from "@workspace/api-zod";
import { requirePublisher } from "../middlewares/publisher";

const router: IRouter = Router();

router.get("/manga", async (req, res): Promise<void> => {
  const query = ListMangaQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { search, type, status, genre, page = 1, limit = 20 } = query.data;
  const offset = (Number(page) - 1) * Number(limit);

  const conditions = [];
  if (search) {
    conditions.push(ilike(mangaTable.title, `%${search}%`));
  }
  if (type) conditions.push(eq(mangaTable.type, type));
  if (status) conditions.push(eq(mangaTable.status, status));
  if (genre) conditions.push(sql`${genre} = ANY(${mangaTable.genres})`);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [allManga, countResult] = await Promise.all([
    db.select().from(mangaTable).where(whereClause).orderBy(desc(mangaTable.updatedAt)).limit(Number(limit)).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(mangaTable).where(whereClause),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  const mangaWithCounts = await Promise.all(
    allManga.map(async (m) => {
      const [chapterCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(chaptersTable)
        .where(and(eq(chaptersTable.mangaId, m.id), eq(chaptersTable.status, "published")));
      return { ...m, chapterCount: Number(chapterCount?.count ?? 0) };
    })
  );

  res.json({ data: mangaWithCounts, total, page: Number(page), limit: Number(limit) });
});

router.post("/manga", requirePublisher, async (req, res): Promise<void> => {
  const parsed = CreateMangaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [manga] = await db
    .insert(mangaTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      coverImage: parsed.data.coverImage ?? null,
      type: parsed.data.type,
      status: parsed.data.status,
      genres: parsed.data.genres ?? [],
    })
    .returning();

  res.status(201).json({ ...manga, chapterCount: 0 });
});

router.get("/manga/stats", async (_req, res): Promise<void> => {
  const [mangaCount, chapterCount, publishedCount, pendingCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(mangaTable),
    db.select({ count: sql<number>`count(*)` }).from(chaptersTable),
    db.select({ count: sql<number>`count(*)` }).from(chaptersTable).where(eq(chaptersTable.status, "published")),
    db.select({ count: sql<number>`count(*)` }).from(chaptersTable).where(eq(chaptersTable.status, "pending")),
  ]);

  res.json({
    totalManga: Number(mangaCount[0]?.count ?? 0),
    totalChapters: Number(chapterCount[0]?.count ?? 0),
    totalPages: Number(chapterCount[0]?.count ?? 0),
    publishedChapters: Number(publishedCount[0]?.count ?? 0),
    pendingChapters: Number(pendingCount[0]?.count ?? 0),
  });
});

router.get("/manga/latest-updates", async (_req, res): Promise<void> => {
  const latestManga = await db.select().from(mangaTable).orderBy(desc(mangaTable.updatedAt)).limit(20);

  const result = await Promise.all(
    latestManga.map(async (m) => {
      const [latestChapter] = await db
        .select()
        .from(chaptersTable)
        .where(and(eq(chaptersTable.mangaId, m.id), eq(chaptersTable.status, "published")))
        .orderBy(desc(chaptersTable.number))
        .limit(1);

      return {
        id: m.id,
        title: m.title,
        coverImage: m.coverImage,
        type: m.type,
        status: m.status,
        latestChapterNumber: latestChapter?.number ?? null,
        latestChapterTitle: latestChapter?.title ?? null,
        latestChapterId: latestChapter?.id ?? null,
        updatedAt: m.updatedAt.toISOString(),
      };
    })
  );

  res.json(result);
});

// GET /manga/trending — top by view count (must be before /:id)
router.get("/manga/trending", async (_req, res): Promise<void> => {
  const limit = Math.min(Number(_req.query.limit) || 10, 20);
  const trending = await db
    .select()
    .from(mangaTable)
    .orderBy(desc(mangaTable.viewCount))
    .limit(limit);
  res.json(trending);
});

// POST /manga/:id/view — increment view count
router.post("/manga/:id/view", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .update(mangaTable)
    .set({ viewCount: sql`${mangaTable.viewCount} + 1` })
    .where(eq(mangaTable.id, id));
  res.json({ ok: true });
});

router.get("/manga/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [manga] = await db.select().from(mangaTable).where(eq(mangaTable.id, id));
  if (!manga) { res.status(404).json({ error: "Manga not found" }); return; }

  const [chapterCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chaptersTable)
    .where(and(eq(chaptersTable.mangaId, id), eq(chaptersTable.status, "published")));

  res.json({ ...manga, chapterCount: Number(chapterCount?.count ?? 0) });
});

router.patch("/manga/:id", requirePublisher, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateMangaBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: Partial<typeof mangaTable.$inferInsert> = {};
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.coverImage !== undefined) updateData.coverImage = parsed.data.coverImage;
  if (parsed.data.type !== undefined) updateData.type = parsed.data.type;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.genres !== undefined) updateData.genres = parsed.data.genres;

  const [updated] = await db.update(mangaTable).set(updateData).where(eq(mangaTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Manga not found" }); return; }

  const [cc] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chaptersTable)
    .where(and(eq(chaptersTable.mangaId, id), eq(chaptersTable.status, "published")));

  res.json({ ...updated, chapterCount: Number(cc?.count ?? 0) });
});

router.delete("/manga/:id", requirePublisher, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(mangaTable).where(eq(mangaTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Manga not found" }); return; }
  res.sendStatus(204);
});

export default router;
