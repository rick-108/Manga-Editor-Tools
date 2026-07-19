import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mangaTable } from "./manga";

// userId stores Clerk string IDs (e.g. "user_2abc...")
// username stores display name at time of comment (no FK needed)
export const commentsTable = pgTable("comments", {
  id: serial("id").primaryKey(),
  mangaId: integer("manga_id").notNull().references(() => mangaTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  username: text("username"),
  content: text("content").notNull(),
  isEdited: boolean("is_edited").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCommentSchema = createInsertSchema(commentsTable).omit({ id: true, createdAt: true });
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof commentsTable.$inferSelect;
