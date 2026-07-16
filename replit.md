# RTN Manga

منصة قراءة مانغا/مانهوا عربية، تدعم رفع الفصول يدوياً أو استيرادها من روابط بعيدة، مع نظام تعليقات ومصادقة للمستخدمين.

## First-time setup

1. `pnpm install` — install all workspace dependencies
2. `pnpm --filter @workspace/db run push` — create database tables (requires `DATABASE_URL`)

Both steps have been completed in the current Replit environment.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/rtn-manga run dev` — run the frontend (port 21301)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — used as JWT secret for user auth
- Optional env: `PUBLISHER_CODE` — publisher password (default: rtn_publisher_2024)
- Optional env: `PUBLISHER_TOKEN` — publisher bearer token (default: rtn_publisher_secret_token)
- Optional env: `IMGBB_API_KEY` — if set, all images are stored on ImgBB (free, unlimited) instead of local disk

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind + shadcn/ui + Wouter routing
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Auth: bcryptjs + JWT (users), bearer token (publisher)
- File uploads: multer (pages + cover image)
- Remote import: axios + cheerio (scraping)
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — Drizzle schema (manga, chapters, pages, users, comments)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/rtn-manga/src/pages/` — React pages
- `artifacts/rtn-manga/src/hooks/use-auth.tsx` — Auth context (user + publisher tokens)
- `artifacts/api-server/uploads/` — Uploaded images (served at /api/uploads/)

## Architecture decisions

- Publisher auth uses a simple shared code (PUBLISHER_CODE env) returning a bearer token — no per-user accounts for publishers
- User auth uses JWT signed with SESSION_SECRET, stored in localStorage
- Upload field name for pages MUST be "pages" (multer.array("pages")) — frontend sends FormData with this field name
- Remote import downloads images locally to /uploads/ so they're served reliably
- Arabic titles and author/artist fields were removed from manga schema by design
- RTL layout enforced on html element via direction:rtl in index.css

## Product

- Home page with hero, stats, latest updates grid
- Manga catalog with search/filter by type/status/genre
- Manga detail page with chapter list and comment section
- Full-screen vertical manga reader with keyboard navigation
- Publisher dashboard (password protected): create manga, add/upload chapters, manage pending chapters, remote import
- User registration/login/profile pages

## User preferences

_Populate as you build._

## Gotchas

- Upload field name for pages is "pages" (multer.array("pages", 500)) — critical to match
- Cover upload field name is "cover" (multer.single("cover"))
- PUBLISHER_CODE env var controls publisher access — never shown in UI
- Remote import scrapes any URL using cheerio with multiple CSS selector fallbacks
- Publisher token must be sent as Authorization: Bearer {token} header

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
