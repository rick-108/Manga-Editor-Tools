import type { Request, Response, NextFunction } from "express";

const PUBLISHER_TOKEN = process.env.PUBLISHER_TOKEN ?? "rtn_publisher_secret_token";

export function requirePublisher(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "غير مصرح - يرجى تسجيل الدخول كناشر" });
    return;
  }

  const token = auth.replace("Bearer ", "");
  if (token !== PUBLISHER_TOKEN) {
    res.status(401).json({ error: "رمز المصادقة غير صحيح" });
    return;
  }

  (req as any).publisherId = "publisher";
  next();
}
