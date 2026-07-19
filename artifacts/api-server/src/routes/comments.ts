import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, commentsTable, userProfilesTable } from "@workspace/db";
import { AddMangaCommentBody } from "@workspace/api-zod";
import { requireUser } from "./auth";
import { awardXp } from "../lib/xp";
import jwt from "jsonwebtoken";
import { getAuth } from "@clerk/express";

const JWT_SECRET = process.env.SESSION_SECRET ?? "rtn_manga_jwt_secret_fallback";

const router: IRouter = Router();

// GET /comments/manga/:mangaId
router.get("/comments/manga/:mangaId", async (req, res): Promise<void> => {
  const rawMangaId = Array.isArray(req.params.mangaId) ? req.params.mangaId[0] : req.params.mangaId;
  const mangaId = parseInt(rawMangaId, 10);
  if (isNaN(mangaId)) { res.status(400).json({ error: "Invalid mangaId" }); return; }

  try {
    const comments = await db
      .select({
        id: commentsTable.id,
        mangaId: commentsTable.mangaId,
        userId: commentsTable.userId,
        username: commentsTable.username,
        content: commentsTable.content,
        createdAt: commentsTable.createdAt,
        profileDisplayName: userProfilesTable.displayName,
        avatarUrl: userProfilesTable.avatarUrl,
      })
      .from(commentsTable)
      .leftJoin(userProfilesTable, eq(commentsTable.userId, userProfilesTable.userId))
      .where(eq(commentsTable.mangaId, mangaId))
      .orderBy(desc(commentsTable.createdAt));

    const result = comments.map((c) => ({
      id: c.id,
      mangaId: c.mangaId,
      userId: c.userId,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      user: {
        username: c.username ?? c.profileDisplayName ?? "مستخدم",
        avatar: c.avatarUrl ?? null,
      },
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

  // Fetch display name + avatar from user_profiles for this Clerk user
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, req.userId));
  const username = profile?.displayName ?? null;
  const avatarUrl = profile?.avatarUrl ?? null;

  const [comment] = await db
    .insert(commentsTable)
    .values({ mangaId, userId: req.userId, username, content: trimmedContent })
    .returning();

  // Award 10 XP — returns whether it was a new event and the updated totals
  const xp = await awardXp(req.userId, "comment", comment.id, 10);

  res.status(201).json({
    id: comment.id,
    mangaId: comment.mangaId,
    userId: comment.userId,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    user: { username: comment.username ?? "مستخدم", avatar: avatarUrl },
    xpAwarded: xp.awarded,
    xpCurrentXp: xp.currentXp,
    xpLevel: xp.level,
  });
});

// DELETE /comments/:commentId — author OR publisher
router.delete("/comments/:commentId", async (req: any, res): Promise<void> => {
  const rawCommentId = Array.isArray(req.params.commentId) ? req.params.commentId[0] : req.params.commentId;
  const commentId = parseInt(rawCommentId, 10);
  if (isNaN(commentId)) { res.status(400).json({ error: "Invalid commentId" }); return; }

  // Check if request comes from a publisher (JWT bearer)
  const authHeader = req.headers.authorization;
  let isPublisher = false;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET);
      isPublisher = true;
    } catch {}
  }

  // If not publisher, require Clerk user session
  let userId: string | null = null;
  if (!isPublisher) {
    const auth = getAuth(req);
    userId = auth?.userId ?? null;
    if (!userId) {
      res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
      return;
    }
  }

  const [comment] = await db.select().from(commentsTable).where(eq(commentsTable.id, commentId));
  if (!comment) { res.status(404).json({ error: "التعليق غير موجود" }); return; }

  // Non-publisher can only delete their own comments
  if (!isPublisher && comment.userId !== userId) {
    res.status(403).json({ error: "لا يمكنك حذف تعليق شخص آخر" });
    return;
  }

  await db.delete(commentsTable).where(eq(commentsTable.id, commentId));
  res.sendStatus(204);
});

export default router;
