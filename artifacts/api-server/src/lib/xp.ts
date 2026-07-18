import { eq } from "drizzle-orm";
import { db, xpEventsTable, userProfilesTable } from "@workspace/db";

/**
 * Award XP to a user for a unique event (comment or chapter completion).
 * Silently ignores duplicate events (already awarded).
 */
export async function awardXp(
  userId: string,
  eventType: "comment" | "chapter",
  refId: number,
  xpAmount: number
): Promise<void> {
  try {
    // Insert event — fails on duplicate unique constraint
    await db.insert(xpEventsTable).values({ userId, eventType, refId });
  } catch {
    // Duplicate key: this event was already rewarded
    return;
  }

  // Event is new — update or create user profile XP
  const [existing] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));

  const currentXp = (existing?.currentXp ?? 0) + xpAmount;
  const level = Math.floor(currentXp / 100) + 1;

  if (existing) {
    await db
      .update(userProfilesTable)
      .set({ currentXp, level, updatedAt: new Date() })
      .where(eq(userProfilesTable.userId, userId));
  } else {
    await db
      .insert(userProfilesTable)
      .values({ userId, currentXp, level });
  }
}
