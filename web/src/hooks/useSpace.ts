import { useLiveQuery } from "dexie-react-hooks";
import { getCurrentSpaceId } from "../db/meta";
export function useSpaceId(): string | null {
  const spaceId = useLiveQuery(() => getCurrentSpaceId(), []);
  return spaceId ?? null;
}
