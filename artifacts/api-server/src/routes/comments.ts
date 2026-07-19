import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, commentsTable, userProfilesTable } from "@workspace/db";
import { AddMangaCommentBody } from "@workspace/api-zod";
import { requireUser } from "./auth";
import { awardXp } from "../lib/xp";

const router: IRouter = Router();

// GET /comments/manga/:mangaId
router.get("/comments/manga/:mangaId", async (req, res): Promise<void> => {
  const rawMangaId = Array.isArray(req.params.mangaId) ? req.params.mangaId[0] : req.params.mangaId;
  const mangaId = parseInt(rawMangaId, 10);
  if (isNaN(mangaId)) { res.status(400).json({ error: "Invalid mangaId" }); return; }

  try {
    const comments = await db
      .select()
      .from(commentsTable)
      .where(eq(commentsTable.mangaId, mangaId))
      .orderBy(desc(commentsTable.createdAt));

    const result = comments.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      user: { username: c.username ?? "مستخدم" },
    }));

    res.json(result);
  } catch (err: any) {
    console.error("[comments GET] DB error:", err?.message, err?.cause?.message ?? "");
    res.status(500).json({ error: "فشل جلب التعليقات" });
  }
});

// POST /comments/manga/:mangaId — requires Clerk session
router.post("/comments/manga/:mangaId", requireUser, async (req: any, res): Promise<void> => {
  const rawMangaId = Array.isArray(req.params.mangaId) ? req.params.mangaId[0] : req.params.mangaId;
  const mangaId = parseInt(rawMangaId, 10);
  if (isNaN(mangaId)) { res.status(400).json({ error: "Invalid mangaId" }); return; }

  const parsed = AddMangaCommentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const trimmedContent = parsed.data.content.trim();
  if (!trimmedContent) {
    res.status(400).json({ error: "التعليق لا يمكن أن يكون فارغاً" });
    return;
  }

  // Fetch display name from user_profiles for this Clerk user
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, req.userId));
  const username = profile?.displayName ?? null;

  const [comment] = await db
    .insert(commentsTable)
    .values({ mangaId, userId: req.userId, username, content: trimmedContent })
    .returning();

  // Award 10 XP — returns whether it was a new event and the updated totals
  const xp = await awardXp(req.userId, "comment", comment.id, 10);

  res.status(201).json({
    ...comment,
    createdAt: comment.createdAt.toISOString(),
    user: { username: comment.username ?? "مستخدم" },
    xpAwarded: xp.awarded,
    xpCurrentXp: xp.currentXp,
    xpLevel: xp.level,
  });
});

// DELETE /comments/:commentId — author only
router.delete("/comments/:commentId", requireUser, async (req: any, res): Promise<void> => {
  const rawCommentId = Array.isArray(req.params.commentId) ? req.params.commentId[0] : req.params.commentId;
  const commentId = parseInt(rawCommentId, 10);
  if (isNaN(commentId)) { res.status(400).json({ error: "Invalid commentId" }); return; }

  const [comment] = await db.select().from(commentsTable).where(eq(commentsTable.id, commentId));
  if (!comment) { res.status(404).json({ error: "Comment not found" }); return; }
  if (comment.userId !== req.userId) { res.status(403).json({ error: "لا يمكنك حذف تعليق شخص آخر" }); return; }

  await db.delete(commentsTable).where(and(eq(commentsTable.id, commentId), eq(commentsTable.userId, req.userId)));
  res.sendStatus(204);
});

export default router;
