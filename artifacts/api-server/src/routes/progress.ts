import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, readingProgressTable, mangaTable, chaptersTable } from "@workspace/db";
import { requireUser } from "./auth";

const router: IRouter = Router();

// POST /progress/:mangaId/:chapterId — save/update progress
router.post("/progress/:mangaId/:chapterId", requireUser, async (req: any, res): Promise<void> => {
  const mangaId = parseInt(req.params.mangaId, 10);
  const chapterId = parseInt(req.params.chapterId, 10);
  if (isNaN(mangaId) || isNaN(chapterId)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Upsert: update if exists, insert if not
  const [existing] = await db
    .select()
    .from(readingProgressTable)
    .where(and(eq(readingProgressTable.userId, req.userId), eq(readingProgressTable.mangaId, mangaId)));

  if (existing) {
    await db
      .update(readingProgressTable)
      .set({ chapterId, updatedAt: new Date() })
      .where(eq(readingProgressTable.id, existing.id));
  } else {
    await db.insert(readingProgressTable).values({ userId: req.userId, mangaId, chapterId });
  }

  res.json({ ok: true });
});

// GET /progress — all reading progress for the user (with manga info)
router.get("/progress", requireUser, async (req: any, res): Promise<void> => {
  const rows = await db
    .select()
    .from(readingProgressTable)
    .where(eq(readingProgressTable.userId, req.userId))
    .orderBy(desc(readingProgressTable.updatedAt));

  const result = await Promise.all(
    rows.map(async (row) => {
      const [manga] = await db.select().from(mangaTable).where(eq(mangaTable.id, row.mangaId));
      const [chapter] = await db.select().from(chaptersTable).where(eq(chaptersTable.id, row.chapterId));
      if (!manga) return null;
      return {
        mangaId: row.mangaId,
        mangaTitle: manga.title,
        mangaCover: manga.coverImage,
        chapterId: row.chapterId,
        chapterNumber: chapter?.number ?? null,
        updatedAt: row.updatedAt.toISOString(),
      };
    })
  );

  res.json(result.filter(Boolean));
});

// GET /progress/:mangaId — progress for specific manga
router.get("/progress/:mangaId", requireUser, async (req: any, res): Promise<void> => {
  const mangaId = parseInt(req.params.mangaId, 10);
  if (isNaN(mangaId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .select()
    .from(readingProgressTable)
    .where(and(eq(readingProgressTable.userId, req.userId), eq(readingProgressTable.mangaId, mangaId)));
  if (!row) { res.json(null); return; }
  const [chapter] = await db.select().from(chaptersTable).where(eq(chaptersTable.id, row.chapterId));
  res.json({ chapterId: row.chapterId, chapterNumber: chapter?.number ?? null });
});

export default router;
