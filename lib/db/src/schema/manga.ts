import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mangaTable = pgTable("manga", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  coverImage: text("cover_image"),
  type: text("type").notNull().default("manhwa"),
  status: text("status").notNull().default("ongoing"),
  genres: text("genres").array().notNull().default([]),
  viewCount: integer("view_count").notNull().default(0),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMangaSchema = createInsertSchema(mangaTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertManga = z.infer<typeof insertMangaSchema>;
export type Manga = typeof mangaTable.$inferSelect;
