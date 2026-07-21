import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const PUBLISHER_CODE = process.env.PUBLISHER_CODE;
const JWT_SECRET = process.env.SESSION_SECRET;
if (!PUBLISHER_CODE || !JWT_SECRET) {
  throw new Error("PUBLISHER_CODE أو SESSION_SECRET غير موجود في البيئة — أضفهما في Secrets");
}

// Clerk-based user auth middleware (cookie session)
export function requireUser(req: any, res: any, next: any): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }
  req.userId = userId; // Clerk string ID e.g. "user_2abc..."
  next();
}

// Publisher JWT middleware (unchanged)
export function requirePublisher(req: any, res: any, next: any): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  try {
    const token = auth.replace("Bearer ", "");
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "رمز الناشر غير صحيح" });
  }
}

const router: IRouter = Router();

// Publisher auth (code → JWT)
router.post("/auth/publisher", async (req, res): Promise<void> => {
  const { code } = req.body ?? {};
  if (!code || code !== PUBLISHER_CODE) {
    res.status(401).json({ success: false, token: null });
    return;
  }
  const token = jwt.sign({ role: "publisher" }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ success: true, token });
});

// Legacy endpoints kept for backwards compat (return 410 Gone)
router.post("/auth/register", (_req, res) => res.status(410).json({ error: "استخدم Clerk للتسجيل" }));
router.post("/auth/login", (_req, res) => res.status(410).json({ error: "استخدم Clerk لتسجيل الدخول" }));
router.get("/auth/me", requireUser, async (req: any, res): Promise<void> => {
  res.json({ clerkUserId: req.userId });
});

export default router;
