import { createContext, useContext, useEffect, useState } from "react";
import { Outlet } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { listSpaces, type Space } from "../api/spaces";
import { registerDevice } from "../api/devices";
import { APP_VERSION } from "../api/client";
import { db } from "../db/schema";
import { getCurrentSpaceId, getDeviceId, setCurrentSpaceId } from "../db/meta";
import { useSpaceId } from "../hooks/useSpace";
import { useSync } from "../sync/useSync";

export const SyncStatusContext = createContext<{ syncing: boolean; lastError: string | null; syncNow(): Promise<void> }>({ syncing: false, lastError: null, syncNow: async () => {} });
export const useSyncStatus = () => useContext(SyncStatusContext);
export const SpacesContext = createContext<Space[]>([]);
export const useSpaces = () => useContext(SpacesContext);

const deviceName = () => { const ua = navigator.userAgent; return /iPhone/.test(ua) ? "iPhone (web)" : /Android/.test(ua) ? "Android (web)" : /Mac/.test(ua) ? "Mac (web)" : "Browser"; };

export function SpaceGate() {
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const spaceId = useSpaceId();
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await listSpaces(); if (!alive) return;
        setSpaces(list);
        const current = await getCurrentSpaceId();
        if (!current || !list.some((s) => s.id === current)) await setCurrentSpaceId((list.find((s) => s.kind === "personal") ?? list[0]!).id);
        void registerDevice({ id: await getDeviceId(), platform: "web", name: deviceName(), app_version: APP_VERSION }).catch(() => {});
      } catch { if (alive) setBootError("Couldn't load your spaces. Check your connection and reload."); }
    })();
    return () => { alive = false; };
  }, []);
  const sync = useSync(spaceId);
  const count = useLiveQuery(() => (spaceId ? db.categories.where({ space_id: spaceId }).count() : Promise.resolve(0)), [spaceId]) ?? 0;
  if (bootError && !spaceId) return <div className="empty">{bootError}</div>;
  if (!spaceId || !spaces) return <div className="empty">Loading…</div>;
  if (count === 0 && sync.syncing) return <div className="empty">Fetching your data…</div>;
  return <SpacesContext.Provider value={spaces}><SyncStatusContext.Provider value={sync}><Outlet /></SyncStatusContext.Provider></SpacesContext.Provider>;
}
