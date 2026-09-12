import { v7 as uuidv7 } from "uuid";
import { db } from "./schema";

const get = async (key: string) => (await db.meta.get(key))?.value ?? null;
const set = (key: string, value: string) => db.meta.put({ key, value });

export const getCursor = async (spaceId: string) => Number((await get(`cursor:${spaceId}`)) ?? 0);
export const setCursor = (spaceId: string, seq: number) => set(`cursor:${spaceId}`, String(seq));
export const getCurrentSpaceId = () => get("currentSpace");
export const setCurrentSpaceId = (id: string) => set("currentSpace", id);
export async function getDeviceId() {
  const existing = await get("deviceId");
  if (existing) return existing;
  const id = uuidv7(); await set("deviceId", id); return id;
}
export const getLastSyncAt = async (spaceId: string) => await get(`lastSync:${spaceId}`);
export const setLastSyncAt = (spaceId: string, iso: string) => set(`lastSync:${spaceId}`, iso);
export const clearAllLocal = () => Promise.all(db.tables.map((t) => t.clear()));
