import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, mangaTable, chaptersTable, pagesTable } from "@workspace/db";
import { PublisherAuthBody } from "@workspace/api-zod";
import { requirePublisher } from "../middlewares/publisher";

const PUBLISHER_CODE = process.env.PUBLISHER_CODE ?? "rtn_publisher_2024";
const PUBLISHER_TOKEN = process.env.PUBLISHER_TOKEN ?? "rtn_publisher_secret_token";

const router: IRouter = Router();

router.post("/publisher/auth", async (req, res): Promise<void> => {
  const parsed = PublisherAuthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.code !== PUBLISHER_CODE) {
    res.status(401).json({ success: false, token: "", message: "كلمة المرور غير صحيحة" });
    return;
  }

  res.json({ success: true, token: PUBLISHER_TOKEN, message: null });
});

router.get("/publisher/pending-chapters", requirePublisher, async (_req, res): Promise<void> => {
  const pendingChapters = await db
    .select()
    .from(chaptersTable)
    .where(eq(chaptersTable.status, "pending"))
    .orderBy(desc(chaptersTable.createdAt));

  const result = await Promise.all(
    pendingChapters.map(async (ch) => {
      const [manga] = await db.select().from(mangaTable).where(eq(mangaTable.id, ch.mangaId));
      const [pc] = await db
        .select({ count: sql<number>`count(*)` })
        .from(pagesTable)
        .where(eq(pagesTable.chapterId, ch.id));

      const [chapterCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(chaptersTable)
        .where(and(eq(chaptersTable.mangaId, ch.mangaId), eq(chaptersTable.status, "published")));

      return {
        ...ch,
        pageCount: Number(pc?.count ?? 0),
        createdAt: ch.createdAt.toISOString(),
        publishedAt: ch.publishedAt?.toISOString() ?? null,
        manga: manga ? { ...manga, chapterCount: Number(chapterCount?.count ?? 0) } : null,
      };
    })
  );

  res.json(result);
});

export default router;
