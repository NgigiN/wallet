import { randomUUID } from "node:crypto";
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
  await db.insert(spaceSettings).values({ spaceId }).onConflictDoNothing();
  await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((c) => ({ id: randomUUID(), spaceId, ...c, clientUpdatedAt: now })),
  ).onConflictDoNothing();
}
