export type Direction = "in" | "out" | "transfer";
export type TxRow = {
  id: string; spaceId: string; capturedBy: string | null; source: string; receiptCode: string | null;
  direction: Direction; amountCents: number; costCents: number; balanceCents: number | null;
  counterparty: string; occurredAt: Date; categoryId: string | null; reason: string | null;
  linkedTransactionId: string | null; clientUpdatedAt: Date; deletedAt: Date | null;
};
export type TxIncoming = Omit<TxRow, "spaceId" | "capturedBy" | "linkedTransactionId">;
export type MergeResult<R> =
  | { action: "insert"; row: R }
  | { action: "update"; row: R }
  | { action: "unchanged"; row: R }
  | { action: "rejected"; error: "immutable" | "bad_category" | "invalid"; message?: string; row?: R };

const DIRECTIONS: ReadonlySet<string> = new Set(["in", "out", "transfer"]);
const IMMUTABLE = ["source", "receiptCode", "direction", "amountCents", "costCents", "balanceCents", "occurredAt"] as const;

function same(a: unknown, b: unknown) {
  return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
}

export function mergeTransaction(
  existing: TxRow | null,
  incoming: TxIncoming,
  ctx: { spaceId: string; userId: string; categoryExists: (id: string) => boolean },
): MergeResult<TxRow> {
  if (!Number.isInteger(incoming.amountCents) || incoming.amountCents <= 0) return { action: "rejected", error: "invalid", message: "amount_cents must be a positive integer" };
  if (!DIRECTIONS.has(incoming.direction)) return { action: "rejected", error: "invalid", message: "direction" };
  if (!incoming.counterparty?.trim()) return { action: "rejected", error: "invalid", message: "counterparty" };
  if (incoming.categoryId !== null && !ctx.categoryExists(incoming.categoryId)) return { action: "rejected", error: "bad_category" };

  if (!existing) {
    return { action: "insert", row: { ...incoming, spaceId: ctx.spaceId, capturedBy: ctx.userId, linkedTransactionId: null } };
  }

  if (existing.source !== "manual") {
    for (const k of IMMUTABLE) {
      if (!same(existing[k], incoming[k])) return { action: "rejected", error: "immutable", message: k, row: existing };
    }
  }

  if (incoming.clientUpdatedAt.getTime() <= existing.clientUpdatedAt.getTime()) return { action: "unchanged", row: existing };

  const row: TxRow = {
    ...existing,
    categoryId: incoming.categoryId,
    reason: incoming.reason,
    deletedAt: incoming.deletedAt,
    clientUpdatedAt: incoming.clientUpdatedAt,
  };
  if (existing.source === "manual") {
    row.amountCents = incoming.amountCents;
    row.costCents = incoming.costCents;
    row.balanceCents = incoming.balanceCents;
    row.counterparty = incoming.counterparty;
    row.occurredAt = incoming.occurredAt;
    row.direction = incoming.direction;
  }
  return { action: "update", row };
}

export type LwwRow = { id: string; clientUpdatedAt: Date; deletedAt: Date | null };

export function mergeLww<R extends LwwRow>(existing: R | null, incoming: R): MergeResult<R> {
  if (!existing) return { action: "insert", row: incoming };
  if (incoming.clientUpdatedAt.getTime() <= existing.clientUpdatedAt.getTime()) return { action: "unchanged", row: existing };
  return { action: "update", row: { ...incoming, id: existing.id } };
}
