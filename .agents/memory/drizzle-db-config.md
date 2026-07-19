---
name: Drizzle DB Config — DATABASE_URL vs NEON_DATABASE_URL
description: Critical config mismatch: drizzle.config.ts used DATABASE_URL (local) while app connects to NEON_DATABASE_URL (cloud Neon). Migrations must target Neon.
---

## The Problem
- `lib/db/drizzle.config.ts` originally used `DATABASE_URL` (Replit local PostgreSQL)
- `lib/db/src/index.ts` uses `NEON_DATABASE_URL ?? DATABASE_URL` (prefers Neon)
- API server also prefers `NEON_DATABASE_URL`
- Result: `drizzle-kit push` would apply schema to local DB, but app ran against Neon → columns missing in production

## The Fix
Updated `drizzle.config.ts` to use the same priority: `NEON_DATABASE_URL ?? DATABASE_URL`.

## Manual Migrations on Neon
When drizzle-kit push fails (no TTY), run migrations directly via:
```bash
node --input-type=module << 'EOF'
import { createRequire } from 'module';
const require = createRequire('/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg/package.json');
const pg = require('/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js');
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
try {
  await pool.query(`YOUR SQL HERE`);
} finally { await pool.end(); }
EOF
```

**Why:** `executeSql` connects to local DB (heliumdb), NOT Neon. To migrate Neon, use the Node.js + pg approach above.

**How to apply:** Before any schema change, run `drizzle-kit push` (now fixed to target Neon). If TTY error, use the manual Node.js migration script.
