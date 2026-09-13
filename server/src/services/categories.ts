import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { categories, spaceSettings } from "../db/schema.js";

export const DEFAULT_CATEGORIES = [
  { name: "food",        kind: "expense",  emoji: "🍛", color: "#B02E0C", sortOrder: 0, isSystem: false },
  { name: "travel",      kind: "expense",  emoji: "🚌", color: "#2B6CB0", sortOrder: 1, isSystem: false },
  { name: "savings",     kind: "expense",  emoji: "🐖", color: "#C43A8A", sortOrder: 2, isSystem: false },
  { name: "church",      kind: "expense",  emoji: "⛪", color: "#8B5CF6", sortOrder: 3, isSystem: false },
  { name: "investments", kind: "expense",  emoji: "📈", color: "#AC8112", sortOrder: 4, isSystem: false },
  { name: "income",      kind: "income",   emoji: "💰", color: "#1B7F4B", sortOrder: 5, isSystem: true },
  { name: "transfer",    kind: "transfer", emoji: "🔁", color: "#607468", sortOrder: 6, isSystem: true },
] as const;

export async function seedCategories(db: Db, spaceId: string) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(spaceSettings).values({ spaceId }).onConflictDoNothing();
    await tx.insert(categories).values(
      DEFAULT_CATEGORIES.map((c) => ({ id: randomUUID(), spaceId, ...c, clientUpdatedAt: now })),
    ).onConflictDoNothing();
  });
}

/**
 * Resolves a category by name (case-insensitive, live rows only) inside a space, creating
 * a plain expense category when none exists. Used by the legacy shim and the importer,
 * which receive category NAMES from the v1 world. Empty / "uncategorized" → null.
 */
export async function resolveCategoryByName(db: Db, spaceId: string, name: string | null | undefined): Promise<string | null> {
  const clean = (name ?? "").trim();
  if (!clean || clean.toLowerCase() === "uncategorized") return null;
  const [existing] = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.spaceId, spaceId), sql`lower(${categories.name}) = lower(${clean})`, isNull(categories.deletedAt))).limit(1);
  if (existing) return existing.id;
  const id = randomUUID();
  await db.insert(categories).values({ id, spaceId, name: clean.toLowerCase(), kind: "expense", emoji: "🧾", color: "#607468", sortOrder: 99, clientUpdatedAt: new Date() });
  return id;
}
