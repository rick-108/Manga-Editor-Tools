import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const userLibraryTable = pgTable(
  "user_library",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    mangaId: integer("manga_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.mangaId)]
);

export type UserLibrary = typeof userLibraryTable.$inferSelect;
