import { eq } from "drizzle-orm";
import { db, xpEventsTable, userProfilesTable } from "@workspace/db";

export interface XpResult {
  awarded: boolean;
  currentXp: number;
  level: number;
}

/**
 * Award XP to a user for a unique event.
 * Returns whether XP was actually awarded and the current totals.
 */
export async function awardXp(
  userId: string,
  eventType: "comment" | "chapter",
  refId: number,
  xpAmount: number
): Promise<XpResult> {
  try {
    await db.insert(xpEventsTable).values({ userId, eventType, refId });
  } catch {
    // Duplicate: already awarded — return current values
    const [profile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId));
    return {
      awarded: false,
      currentXp: profile?.currentXp ?? 0,
      level: profile?.level ?? 1,
    };
  }

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
    await db.insert(userProfilesTable).values({ userId, currentXp, level });
  }

  return { awarded: true, currentXp, level };
}
