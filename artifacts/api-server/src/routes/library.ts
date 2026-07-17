import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, userLibraryTable, mangaTable, chaptersTable } from "@workspace/db";
import { requireUser } from "./auth";

const router: IRouter = Router();

// GET /library — user's saved manga list
router.get("/library", requireUser, async (req: any, res): Promise<void> => {
  const rows = await db
    .select()
    .from(userLibraryTable)
    .where(eq(userLibraryTable.userId, req.userId))
    .orderBy(desc(userLibraryTable.createdAt));

  const mangaIds = rows.map((r) => r.mangaId);
  if (mangaIds.length === 0) { res.json([]); return; }

  const mangaList = await Promise.all(
    mangaIds.map(async (id) => {
      const [m] = await db.select().from(mangaTable).where(eq(mangaTable.id, id));
      if (!m) return null;
      const [latest] = await db
        .select()
        .from(chaptersTable)
        .where(and(eq(chaptersTable.mangaId, id), eq(chaptersTable.status, "published")))
        .orderBy(desc(chaptersTable.number))
        .limit(1);
      return { ...m, latestChapterNumber: latest?.number ?? null };
    })
  );

  res.json(mangaList.filter(Boolean));
});

// GET /library/:mangaId/check — is manga in user's library
router.get("/library/:mangaId/check", requireUser, async (req: any, res): Promise<void> => {
  const mangaId = parseInt(req.params.mangaId, 10);
  if (isNaN(mangaId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .select()
    .from(userLibraryTable)
    .where(and(eq(userLibraryTable.userId, req.userId), eq(userLibraryTable.mangaId, mangaId)));
  res.json({ saved: !!row });
});

// POST /library/:mangaId — add to library
router.post("/library/:mangaId", requireUser, async (req: any, res): Promise<void> => {
  const mangaId = parseInt(req.params.mangaId, 10);
  if (isNaN(mangaId)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.insert(userLibraryTable).values({ userId: req.userId, mangaId });
    res.json({ saved: true });
  } catch {
    res.json({ saved: true }); // already exists
  }
});

// DELETE /library/:mangaId — remove from library
router.delete("/library/:mangaId", requireUser, async (req: any, res): Promise<void> => {
  const mangaId = parseInt(req.params.mangaId, 10);
  if (isNaN(mangaId)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .delete(userLibraryTable)
    .where(and(eq(userLibraryTable.userId, req.userId), eq(userLibraryTable.mangaId, mangaId)));
  res.json({ saved: false });
});

export default router;
