import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db, type LocalBudget, type LocalTx } from "../db/schema";
import { useCategories } from "./useCategories";
export function useSpaceData(spaceId: string | null) {
  const all = useLiveQuery(() => (spaceId ? db.transactions.where({ space_id: spaceId }).toArray() : Promise.resolve([] as LocalTx[])), [spaceId]) ?? [];
  const budgetsAll = useLiveQuery(() => (spaceId ? db.budgets.where({ space_id: spaceId }).toArray() : Promise.resolve([] as LocalBudget[])), [spaceId]) ?? [];
  const cats = useCategories(spaceId);
  const rows = useMemo(() => all.filter((t) => !t.deleted_at), [all]);
  const budgets = useMemo(() => budgetsAll.filter((b) => !b.deleted_at), [budgetsAll]);
  const earliest = useMemo(() => rows.reduce<string | null>((m, t) => (m === null || t.occurred_at < m ? t.occurred_at : m), null), [rows]);
  return { rows, cats, budgets, earliest: earliest ? new Date(earliest) : new Date() };
}
