import { db } from "./schema";

// Dexie orders compound keys element by element, so ["space", ""] … ["space", "￿"] is
// exactly one space's rows and a tighter pair of ISO timestamps is exactly the rows inside
// that window — read from the [space_id+occurred_at] index instead of scanning the table.
// The upper bound is exclusive, matching the half-open ranges logic/period.ts produces.
const LOWEST = "";
const HIGHEST = "￿";

/** Transactions of a space, oldest first, optionally limited to an ISO [from, to) window. */
export const txWindow = (spaceId: string, from?: string, to?: string) =>
  db.transactions.where("[space_id+occurred_at]").between([spaceId, from ?? LOWEST], [spaceId, to ?? HIGHEST], true, false);
