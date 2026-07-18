import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const xpEventsTable = pgTable(
  "xp_events",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    eventType: text("event_type").notNull(), // 'comment' | 'chapter'
    refId: integer("ref_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.eventType, t.refId)]
);

export type XpEvent = typeof xpEventsTable.$inferSelect;
