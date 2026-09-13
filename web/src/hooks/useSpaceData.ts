import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db, type LocalBudget, type LocalTx } from "../db/schema";
import { txWindow } from "../db/queries";
import { useCategories } from "./useCategories";

/**
 * Rows for the screens that aggregate. `win` (ISO strings, upper bound exclusive) bounds the
 * read to what the caller can actually display: without it a space with years of history
 * loads every row into memory on every render of Stats or Budgets.
 */
export function useSpaceData(spaceId: string | null, win?: { from: string; to: string }) {
  const from = win?.from, to = win?.to;
  const all = useLiveQuery(() => (spaceId ? txWindow(spaceId, from, to).toArray() : Promise.resolve([] as LocalTx[])), [spaceId, from, to]) ?? [];
  const budgetsAll = useLiveQuery(() => (spaceId ? db.budgets.where({ space_id: spaceId }).toArray() : Promise.resolve([] as LocalBudget[])), [spaceId]) ?? [];
  const cats = useCategories(spaceId);
  const rows = useMemo(() => all.filter((t) => !t.deleted_at), [all]);
  const budgets = useMemo(() => budgetsAll.filter((b) => !b.deleted_at), [budgetsAll]);
  // The period jump list needs the oldest row in the space, which the window usually
  // excludes: take it from the near end of the same index rather than from `rows`.
  const oldest = useLiveQuery<LocalTx | undefined>(() => (spaceId ? txWindow(spaceId).filter((t) => !t.deleted_at).first() : Promise.resolve(undefined)), [spaceId]);
  return { rows, cats, budgets, earliest: oldest ? new Date(oldest.occurred_at) : new Date() };
}
