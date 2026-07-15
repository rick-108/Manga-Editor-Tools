import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mangaTable } from "./manga";

export const chaptersTable = pgTable("chapters", {
  id: serial("id").primaryKey(),
  mangaId: integer("manga_id").notNull().references(() => mangaTable.id, { onDelete: "cascade" }),
  number: real("number").notNull(),
  title: text("title"),
  status: text("status").notNull().default("pending"),
  publisherId: text("publisher_id"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertChapterSchema = createInsertSchema(chaptersTable).omit({ id: true, createdAt: true, updatedAt: true, publishedAt: true });
export type InsertChapter = z.infer<typeof insertChapterSchema>;
export type Chapter = typeof chaptersTable.$inferSelect;
