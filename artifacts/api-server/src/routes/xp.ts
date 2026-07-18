import { Router, type IRouter } from "express";
import { requireUser } from "./auth";
import { awardXp } from "../lib/xp";

const router: IRouter = Router();

// POST /xp/chapter-complete/:mangaId/:chapterId
// Awards 20 XP when the user finishes reading a chapter (reaches last page).
// The unique constraint in xp_events prevents duplicate awards.
router.post(
  "/xp/chapter-complete/:mangaId/:chapterId",
  requireUser,
  async (req: any, res): Promise<void> => {
    const chapterId = parseInt(req.params.chapterId, 10);
    if (isNaN(chapterId)) {
      res.status(400).json({ error: "Invalid chapterId" });
      return;
    }
    await awardXp(req.userId, "chapter", chapterId, 20);
    res.json({ ok: true });
  }
);

export default router;
