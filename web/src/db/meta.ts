import { v7 as uuidv7 } from "uuid";
import { db } from "./schema";
import type { Space } from "../api/spaces";

const get = async (key: string) => (await db.meta.get(key))?.value ?? null;
const set = (key: string, value: string) => db.meta.put({ key, value });

export const getCursor = async (spaceId: string) => Number((await get(`cursor:${spaceId}`)) ?? 0);
export const setCursor = (spaceId: string, seq: number) => set(`cursor:${spaceId}`, String(seq));
export const getCurrentSpaceId = () => get("currentSpace");
export const setCurrentSpaceId = (id: string) => set("currentSpace", id);
/** Last-known space list, used so the app can open offline from the local store. */
export const getCachedSpaces = async (): Promise<Space[] | null> => { const v = await get("spaces"); return v ? (JSON.parse(v) as Space[]) : null; };
export const setCachedSpaces = (list: Space[]) => db.meta.put({ key: "spaces", value: JSON.stringify(list) });
export async function getDeviceId() {
  const existing = await get("deviceId");
  if (existing) return existing;
  const id = uuidv7(); await set("deviceId", id); return id;
}
export const getLastSyncAt = async (spaceId: string) => await get(`lastSync:${spaceId}`);
export const setLastSyncAt = (spaceId: string, iso: string) => set(`lastSync:${spaceId}`, iso);
export const clearAllLocal = () => Promise.all(db.tables.map((t) => t.clear()));
/**
 * Sign-out wipe. Everything goes except the device id: it identifies this browser to the
 * server, so minting a new one on every sign-out would leave a trail of dead devices in the
 * user's device list.
 */
export async function clearAllLocalKeepingDevice() {
  const deviceId = await getDeviceId();
  await clearAllLocal();
  await db.meta.put({ key: "deviceId", value: deviceId });
}
