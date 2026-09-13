import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db, type LocalCategory } from "../db/schema";
export function useCategories(spaceId: string | null) {
  const rows = useLiveQuery(() => (spaceId ? db.categories.where({ space_id: spaceId }).toArray() : Promise.resolve([] as LocalCategory[])), [spaceId]) ?? [];
  return useMemo(() => {
    const list = rows.filter((c) => !c.deleted_at).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    return { list, byId: new Map(list.map((c) => [c.id, c])), pickable: list.filter((c) => !c.archived && c.kind !== "transfer") };
  }, [rows]);
}
