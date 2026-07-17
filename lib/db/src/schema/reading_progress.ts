import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const readingProgressTable = pgTable(
  "reading_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    mangaId: integer("manga_id").notNull(),
    chapterId: integer("chapter_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.mangaId)]
);

export type ReadingProgress = typeof readingProgressTable.$inferSelect;
