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

/** Shared: check publisher JWT, fallback to Clerk user. Returns { isPublisher, userId }. */
function resolveActor(req: any): { isPublisher: boolean; userId: string | null } {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET);
      return { isPublisher: true, userId: null };
    } catch {}
  }
  const userId = getAuth(req)?.userId ?? null;
  return { isPublisher: false, userId };
}

// ── GET /comments/manga/:mangaId ─────────────────────────────────────────────
router.get("/comments/manga/:mangaId", async (req, res): Promise<void> => {
  const mangaId = parseInt(req.params.mangaId, 10);
  if (isNaN(mangaId)) { res.status(400).json({ error: "Invalid mangaId" }); return; }

  try {
    const rows = await db
      .select({
        id: commentsTable.id,
        mangaId: commentsTable.mangaId,
        userId: commentsTable.userId,
        username: commentsTable.username,
        content: commentsTable.content,
        isEdited: commentsTable.isEdited,
        createdAt: commentsTable.createdAt,
        updatedAt: commentsTable.updatedAt,
        profileDisplayName: userProfilesTable.displayName,
        avatarUrl: userProfilesTable.avatarUrl,
      })
      .from(commentsTable)
      .leftJoin(userProfilesTable, eq(commentsTable.userId, userProfilesTable.userId))
      .where(eq(commentsTable.mangaId, mangaId))
      .orderBy(desc(commentsTable.createdAt));

    res.json(rows.map((c) => ({
      id: c.id,
      mangaId: c.mangaId,
      userId: c.userId,
      content: c.content,
      isEdited: c.isEdited,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      user: {
        username: c.username ?? c.profileDisplayName ?? "مستخدم",
        avatar: c.avatarUrl ?? null,
      },
    })));
  } catch (err: any) {
    console.error("[comments GET]", err?.message);
    res.status(500).json({ error: "فشل جلب التعليقات" });
  }
});

// ── POST /comments/manga/:mangaId — requires Clerk session ───────────────────
router.post("/comments/manga/:mangaId", requireUser, async (req: any, res): Promise<void> => {
  const mangaId = parseInt(req.params.mangaId, 10);
  if (isNaN(mangaId)) { res.status(400).json({ error: "Invalid mangaId" }); return; }

  const parsed = AddMangaCommentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const trimmedContent = parsed.data.content.trim();
  if (!trimmedContent) { res.status(400).json({ error: "التعليق لا يمكن أن يكون فارغاً" }); return; }

  // Fetch display name + avatar from user_profiles
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, req.userId));

  const [comment] = await db
    .insert(commentsTable)
    .values({
      mangaId,
      userId: req.userId,
      username: profile?.displayName ?? null,
      content: trimmedContent,
    })
    .returning();

  const xp = await awardXp(req.userId, "comment", comment.id, 10);

  res.status(201).json({
    id: comment.id,
    mangaId: comment.mangaId,
    userId: comment.userId,
    content: comment.content,
    isEdited: comment.isEdited,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    user: {
      username: comment.username ?? profile?.displayName ?? "مستخدم",
      avatar: profile?.avatarUrl ?? null,
    },
    xpAwarded: xp.awarded,
    xpCurrentXp: xp.currentXp,
    xpLevel: xp.level,
  });
});

// ── PATCH /comments/:commentId — author or publisher ─────────────────────────
router.patch("/comments/:commentId", async (req: any, res): Promise<void> => {
  const commentId = parseInt(req.params.commentId, 10);
  if (isNaN(commentId)) { res.status(400).json({ error: "Invalid commentId" }); return; }

  const { content } = req.body ?? {};
  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "محتوى التعليق مطلوب" });
    return;
  }

  const { isPublisher, userId } = resolveActor(req);
  if (!isPublisher && !userId) { res.status(401).json({ error: "يجب تسجيل الدخول أولاً" }); return; }

  const [comment] = await db.select().from(commentsTable).where(eq(commentsTable.id, commentId));
  if (!comment) { res.status(404).json({ error: "التعليق غير موجود" }); return; }
  if (!isPublisher && comment.userId !== userId) {
    res.status(403).json({ error: "لا يمكنك تعديل تعليق شخص آخر" });
    return;
  }

  const [updated] = await db
    .update(commentsTable)
    .set({ content: content.trim(), isEdited: true, updatedAt: new Date() })
    .where(eq(commentsTable.id, commentId))
    .returning();

  res.json({
    id: updated.id,
    mangaId: updated.mangaId,
    userId: updated.userId,
    content: updated.content,
    isEdited: updated.isEdited,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// ── DELETE /comments/:commentId — author or publisher ────────────────────────
router.delete("/comments/:commentId", async (req: any, res): Promise<void> => {
  const commentId = parseInt(req.params.commentId, 10);
  if (isNaN(commentId)) { res.status(400).json({ error: "Invalid commentId" }); return; }

  const { isPublisher, userId } = resolveActor(req);
  if (!isPublisher && !userId) { res.status(401).json({ error: "يجب تسجيل الدخول أولاً" }); return; }

  const [comment] = await db.select().from(commentsTable).where(eq(commentsTable.id, commentId));
  if (!comment) { res.status(404).json({ error: "التعليق غير موجود" }); return; }
  if (!isPublisher && comment.userId !== userId) {
    res.status(403).json({ error: "لا يمكنك حذف تعليق شخص آخر" });
    return;
  }

  await db.delete(commentsTable).where(eq(commentsTable.id, commentId));
  res.sendStatus(204);
});

export default router;
