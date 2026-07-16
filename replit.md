# RTN Manga

منصة قراءة مانغا/مانهوا عربية، تدعم رفع الفصول يدوياً أو استيرادها من روابط بعيدة، مع نظام تعليقات ومصادقة للمستخدمين.

---

## ⚠️ تعليمات إلزامية لأي Agent/AI يعمل على هذا المشروع

> **اقرأ هذا القسم أولاً قبل أي شيء آخر.**

### قاعدة البيانات — لا تُنشئ قاعدة جديدة أبداً

- هذا المشروع **متصل بقاعدة بيانات Neon سحابية موجودة ومليئة بالبيانات**.
- المفتاح المطلوب: `NEON_DATABASE_URL` — يجب أن يكون موجوداً في Replit Secrets.
- **إذا لم تجد `NEON_DATABASE_URL` في Secrets: اطلب من المستخدم إضافته فوراً. لا تُنشئ قاعدة بيانات جديدة ولا تشغّل `drizzle-kit push` قبل الحصول عليه.**
- لا تستخدم قاعدة Replit المدمجة (`DATABASE_URL`) — الكود يفضّل `NEON_DATABASE_URL` تلقائياً.
- أمر `drizzle-kit push` يُشغَّل **فقط** إذا طلب المستخدم صراحةً إضافة جدول جديد، وبعد موافقته على ذلك.

### الصور — يجب استخدام ImgBB

- الصور (أغلفة المانغا وصفحات الفصول) تُرفع على **ImgBB** لتكون دائمة.
- المفتاح المطلوب: `IMGBB_API_KEY` — يجب أن يكون موجوداً في Replit Secrets.
- **إذا لم تجد `IMGBB_API_KEY`: اطلب من المستخدم إضافته. الصور بدونه تُحفظ محلياً وستضيع.**
- احصل على المفتاح من: https://api.imgbb.com

### المفاتيح المطلوبة لتشغيل المشروع

| المفتاح | نوعه | الوصف |
|---------|------|-------|
| `NEON_DATABASE_URL` | Secret (إلزامي) | رابط Neon السحابي — لا تُنشئ بديلاً |
| `SESSION_SECRET` | Secret (إلزامي) | نص عشوائي لتشفير جلسات المستخدمين |
| `IMGBB_API_KEY` | Secret (إلزامي عملياً) | مفتاح رفع الصور الدائم |
| `PUBLISHER_CODE` | Secret (اختياري) | كلمة مرور لوحة الناشر |
| `PUBLISHER_TOKEN` | Secret (اختياري) | رمز Bearer للناشر |

---

## First-time setup (حساب جديد)

1. أضف جميع المفاتيح أعلاه في **Replit Secrets** أولاً
2. `pnpm install` — تثبيت المكتبات
3. **لا تشغّل `drizzle-kit push`** — الجداول موجودة في Neon مسبقاً

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — تشغيل API (port 8080)
- `pnpm --filter @workspace/rtn-manga run dev` — تشغيل الواجهة (port 21301)
- `pnpm run typecheck` — فحص TypeScript
- `pnpm run build` — بناء المشروع كاملاً
- `pnpm --filter @workspace/api-spec run codegen` — إعادة توليد API hooks من OpenAPI
- `pnpm --filter @workspace/db run push` — ⚠️ لإضافة جداول جديدة فقط (بموافقة صريحة)

---

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- Frontend: React + Vite + Tailwind + shadcn/ui + Wouter routing
- API: Express 5
- DB: PostgreSQL (Neon) + Drizzle ORM
- Auth: bcryptjs + JWT (users), bearer token (publisher)
- File uploads: multer → ImgBB (دائم) أو local disk (مؤقت كـ fallback)
- Remote import: axios + cheerio
- Validation: Zod, drizzle-zod
- Build: esbuild (CJS bundle)

---

## Architecture decisions

- **قاعدة البيانات الوحيدة هي Neon** — كل المانغا والفصول والصفحات والمستخدمين والتعليقات تُحفظ فيها
- الكود في `lib/db/src/index.ts` يستخدم `NEON_DATABASE_URL` أولاً ثم `DATABASE_URL` كـ fallback
- صور الغلاف وصفحات الفصول تذهب لـ ImgBB إذا كان `IMGBB_API_KEY` موجوداً — وإلا تُحفظ محلياً (مؤقت)
- Publisher auth: كود مشترك بسيط (`PUBLISHER_CODE`) يُرجع Bearer token
- User auth: JWT مُوقَّع بـ `SESSION_SECRET` مخزَّن في localStorage
- RTL layout مُفعَّل على عنصر html عبر `direction:rtl` في index.css

## Where things live

- `lib/api-spec/openapi.yaml` — عقد الـ API (source of truth)
- `lib/db/src/schema/` — Drizzle schema (manga, chapters, pages, users, comments)
- `lib/db/src/index.ts` — اتصال قاعدة البيانات
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/storage.ts` — منطق رفع الصور (ImgBB أو local)
- `artifacts/rtn-manga/src/pages/` — React pages
- `artifacts/rtn-manga/src/hooks/use-auth.tsx` — Auth context

## Gotchas

- Upload field name for pages: `"pages"` (multer.array("pages", 500))
- Cover upload field name: `"cover"` (multer.single("cover"))
- `NEON_DATABASE_URL` يُقدَّم على `DATABASE_URL` — لا تحذفه
- Remote import يسحب الصور من أي رابط عبر cheerio

## User preferences

- اللغة العربية في التواصل مع المستخدم
- قاعدة البيانات: Neon فقط — لا بديل
- الصور: ImgBB فقط — لا تخزين محلي دائم
