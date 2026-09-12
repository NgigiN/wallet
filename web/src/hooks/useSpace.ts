import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/schema";
export function useSpaceId(): string | null {
  const row = useLiveQuery(() => db.meta.get("currentSpace"), []);
  return row?.value ?? null;
}
