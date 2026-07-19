import { Router, type IRouter } from "express";
import { requireUser } from "./auth";
import { awardXp } from "../lib/xp";

const router: IRouter = Router();

// POST /xp/chapter-complete/:mangaId/:chapterId
// Returns { awarded, currentXp, level }
router.post(
  "/xp/chapter-complete/:mangaId/:chapterId",
  requireUser,
  async (req: any, res): Promise<void> => {
    const chapterId = parseInt(req.params.chapterId, 10);
    if (isNaN(chapterId)) {
      res.status(400).json({ error: "Invalid chapterId" });
      return;
    }
    const result = await awardXp(req.userId, "chapter", chapterId, 20);
    res.json(result);
  }
);

export default router;
