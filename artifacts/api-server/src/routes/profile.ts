import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import multer from "multer";
import path from "path";
import { db, userProfilesTable } from "@workspace/db";
import { requireUser } from "./auth";
import { storeUploadedFile, uploadsDir } from "../lib/storage";

const router: IRouter = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `avatar_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("يُقبل فقط ملفات الصور"));
  },
});

// GET /profile — fetch stored profile for current user
router.get("/profile", requireUser, async (req: any, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, req.userId));
  res.json(row ?? null);
});

// PATCH /profile — update display name
router.patch("/profile", requireUser, async (req: any, res): Promise<void> => {
  const { displayName } = req.body ?? {};
  if (typeof displayName !== "string" || !displayName.trim()) {
    res.status(400).json({ error: "الاسم مطلوب" });
    return;
  }
  const trimmed = displayName.trim().slice(0, 80);

  const [existing] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, req.userId));

  if (existing) {
    const [updated] = await db
      .update(userProfilesTable)
      .set({ displayName: trimmed, updatedAt: new Date() })
      .where(eq(userProfilesTable.userId, req.userId))
      .returning();
    res.json(updated);
  } else {
    const [inserted] = await db
      .insert(userProfilesTable)
      .values({ userId: req.userId, displayName: trimmed })
      .returning();
    res.json(inserted);
  }
});

// POST /profile/avatar — upload avatar via Telegram
router.post(
  "/profile/avatar",
  requireUser,
  upload.single("avatar"),
  async (req: any, res): Promise<void> => {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: "لم يتم إرسال ملف" });
      return;
    }

    let avatarUrl: string;
    try {
      avatarUrl = await storeUploadedFile(file.path, file.originalname || file.filename);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "فشل رفع الصورة" });
      return;
    }

    const [existing] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, req.userId));

    if (existing) {
      const [updated] = await db
        .update(userProfilesTable)
        .set({ avatarUrl, updatedAt: new Date() })
        .where(eq(userProfilesTable.userId, req.userId))
        .returning();
      res.json(updated);
    } else {
      const [inserted] = await db
        .insert(userProfilesTable)
        .values({ userId: req.userId, avatarUrl })
        .returning();
      res.json(inserted);
    }
  },
);

export default router;
