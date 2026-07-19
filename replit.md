# RTN Manga

منصة قراءة مانغا/مانهوا عربية، تدعم رفع الفصول يدوياً أو استيرادها من روابط بعيدة، مع نظام تعليقات ومصادقة للمستخدمين.

---

## ⚠️ تعليمات إلزامية لأي Agent/AI يعمل على هذا المشروع

> **اقرأ هذا القسم أولاً قبل أي شيء آخر.**

### قاعدة البيانات — لا تُنشئ قاعدة جديدة أبداً

- هذا المشروع **متصل بقاعدة بيانات Neon سحابية موجودة ومليئة بالبيانات**.
- المفتاح المطلوب: `NEON_DATABASE_URL` — يجب أن يكون موجوداً في Replit Secrets.
- **إذا لم تجد `NEON_DATABASE_URL`: اطلب من المستخدم إضافته فوراً. لا تُنشئ قاعدة جديدة ولا تُشغّل `drizzle-kit push` بدون إذن صريح.**
- لا تستخدم قاعدة Replit المدمجة (`DATABASE_URL`) — الكود يُفضّل `NEON_DATABASE_URL` تلقائياً.

### الصور — يجب استخدام Telegram Bot حصراً

- **جميع الصور** (أغلفة المانغا وصفحات الفصول) تُرفع على **Telegram** عبر Bot.
- المفاتيح المطلوبة: `TELEGRAM_BOT_TOKEN` و `TELEGRAM_CHANNEL_ID`.
- **لا يوجد fallback محلي أو خدمة بديلة** — السيرفر يرفض الرفع بدون هذين المفتاحين.
- الصور تُخدَم عبر `/api/img/:fileId` (proxy داخلي يُخفي التوكن).
- **لا تُضف ImgBB أو أي خدمة رفع أخرى** — Telegram هو النظام الوحيد المعتمد.

### المفاتيح المطلوبة (Replit Secrets)

| المفتاح | الوصف | إلزامي؟ |
|---------|-------|---------|
| `NEON_DATABASE_URL` | رابط Neon السحابي — لا تُنشئ بديلاً | ✅ إلزامي |
| `SESSION_SECRET` | نص عشوائي لتشفير جلسات المستخدمين | ✅ إلزامي |
| `TELEGRAM_BOT_TOKEN` | توكن البوت من @BotFather | ✅ إلزامي |
| `TELEGRAM_CHANNEL_ID` | معرّف القناة (سالب: مثال -1001234567890) | ✅ إلزامي |
| `CLERK_PUBLISHABLE_KEY` | مفتاح Clerk العام للخادم | ✅ إلزامي |
| `CLERK_SECRET_KEY` | مفتاح Clerk السري للخادم | ✅ إلزامي |
| `VITE_CLERK_PUBLISHABLE_KEY` | مفتاح Clerk العام للواجهة الأمامية | ✅ إلزامي |

---

## 🚀 إعداد المشروع من جيت هوب (حساب جديد)

1. **استيراد المشروع** من GitHub إلى Replit — المكتبات تُثبَّت تلقائياً
2. **أضف Secrets** الأربعة أعلاه في: `Replit → Tools → Secrets`
3. **شغّل** الـ workflows:
   - `artifacts/api-server: API Server` — API على port 8080
   - `artifacts/rtn-manga: web` — الواجهة على port 21301
4. **لا تشغّل** `drizzle-kit push` — الجداول موجودة في Neon مسبقاً

### إذا لم تُثبَّت المكتبات تلقائياً:
```bash
pnpm install
```

---

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — تشغيل API
- `pnpm --filter @workspace/rtn-manga run dev` — تشغيل الواجهة
- `pnpm run typecheck` — فحص TypeScript
- `pnpm --filter @workspace/db run push` — ⚠️ لإضافة جداول جديدة فقط (بموافقة صريحة)

---

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- Frontend: React + Vite + Tailwind + shadcn/ui + Wouter routing
- API: Express 5
- DB: PostgreSQL (Neon) + Drizzle ORM
- Auth: bcryptjs + JWT (users)، bearer token (publisher)
- File uploads: multer (مؤقت) → **Telegram Bot** (دائم)
- Remote import: axios + cheerio
- Validation: Zod, drizzle-zod
- Build: esbuild

---

## Architecture decisions

- **قاعدة البيانات الوحيدة هي Neon** — كل المانغا والفصول والصفحات والمستخدمين والتعليقات تُحفظ فيها
- **Telegram Bot هو نظام التخزين الوحيد للصور** — ليس له أي بديل في الكود
- الصور تُخدَم عبر `/api/img/:fileId` — proxy يُخفي التوكن ويُخزّن الرابط 50 دقيقة
- `file_id` الذي تُعيده Telegram دائم — يمكن إعادة جلب رابط التنزيل في أي وقت
- Publisher auth: كود مشترك (`PUBLISHER_CODE`) يُرجع Bearer token
- User auth: JWT مُوقَّع بـ `SESSION_SECRET` مخزَّن في localStorage
- RTL layout مُفعَّل على عنصر html عبر `direction:rtl` في index.css

## Where things live

- `lib/api-spec/openapi.yaml` — عقد الـ API (source of truth)
- `lib/db/src/schema/` — Drizzle schema
- `artifacts/api-server/src/lib/storage.ts` — رفع الصور إلى Telegram
- `artifacts/api-server/src/routes/img.ts` — proxy endpoint للصور
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/rtn-manga/src/pages/` — React pages

## Gotchas

- Upload field name for pages: `"pages"` (multer.array("pages", 500))
- Cover upload field name: `"cover"` (multer.single("cover"))
- `NEON_DATABASE_URL` يُقدَّم على `DATABASE_URL` — لا تحذفه
- `TELEGRAM_CHANNEL_ID` يجب أن يكون سالباً للقنوات الخاصة
- Remote import يسحب الصور ثم يرفعها إلى Telegram (لا يرسل الرابط مباشرة)
- `view_count` عمود في جدول manga — يُزاد عند فتح أي فصل (مرة واحدة لكل جلسة، مخزَّنة في sessionStorage)
- `GET /api/manga/trending` — يرجع أعلى 10 أعمال بحسب view_count
- `POST /api/manga/:id/view` — يزيد view_count بمقدار 1 (يُستدعى من reader.tsx)
- المظهر الداكن/الفاتح: يُخزَّن في localStorage بمفتاح "theme"، ويُطبَّق عبر class "light" على عنصر html

## User preferences

- اللغة العربية في التواصل مع المستخدم
- قاعدة البيانات: Neon فقط — لا بديل
- الصور: Telegram Bot فقط — لا تخزين محلي ولا ImgBB
