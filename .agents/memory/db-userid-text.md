---
name: DB user_id columns are TEXT
description: user_library and reading_progress tables use TEXT for user_id to hold Clerk string IDs.
---

## Rule
`user_library.user_id` and `reading_progress.user_id` are TEXT columns (not INTEGER).

**Why:** Clerk user IDs are strings like `user_2abc123...`. The columns were originally INTEGER
for the old custom auth system but were ALTERed to TEXT when migrating to Clerk.

**How to apply:** Any new table that links to a Clerk user must use `text("user_id")` in the
Drizzle schema (not `integer`). The DB migration was done directly via ALTER TABLE.
