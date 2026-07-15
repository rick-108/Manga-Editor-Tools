import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, commentsTable, usersTable } from "@workspace/db";
import { AddMangaCommentBody } from "@workspace/api-zod";
import { requireUser } from "./auth";

const router: IRouter = Router();

router.get("/comments/manga/:mangaId", async (req, res): Promise<void> => {
  const rawMangaId = Array.isArray(req.params.mangaId) ? req.params.mangaId[0] : req.params.mangaId;
  const mangaId = parseInt(rawMangaId, 10);
  if (isNaN(mangaId)) { res.status(400).json({ error: "Invalid mangaId" }); return; }

  const comments = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.mangaId, mangaId))
    .orderBy(desc(commentsTable.createdAt));

  const result = await Promise.all(
    comments.map(async (c) => {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, c.userId));
      return {
        ...c,
        createdAt: c.createdAt.toISOString(),
        user: user ? { id: user.id, username: user.username, email: user.email, avatar: user.avatar, createdAt: user.createdAt.toISOString() } : null,
      };
    })
  );

  res.json(result);
});

router.post("/comments/manga/:mangaId", requireUser, async (req: any, res): Promise<void> => {
  const rawMangaId = Array.isArray(req.params.mangaId) ? req.params.mangaId[0] : req.params.mangaId;
  const mangaId = parseInt(rawMangaId, 10);
  if (isNaN(mangaId)) { res.status(400).json({ error: "Invalid mangaId" }); return; }

  const parsed = AddMangaCommentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [comment] = await db
    .insert(commentsTable)
    .values({ mangaId, userId: req.userId, content: parsed.data.content })
    .returning();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId));

  res.status(201).json({
    ...comment,
    createdAt: comment.createdAt.toISOString(),
    user: user ? { id: user.id, username: user.username, email: user.email, avatar: user.avatar, createdAt: user.createdAt.toISOString() } : null,
  });
});

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
