import { createContext, useContext, useEffect, useState } from "react";
import { Outlet } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { listSpaces, type Space } from "../api/spaces";
import { registerDevice } from "../api/devices";
import { APP_VERSION } from "../api/client";
import { db } from "../db/schema";
import { getCachedSpaces, getCurrentSpaceId, getDeviceId, setCachedSpaces, setCurrentSpaceId } from "../db/meta";
import { useSpaceId } from "../hooks/useSpace";
import { useSync } from "../sync/useSync";

export const SyncStatusContext = createContext<{ syncing: boolean; lastError: string | null; syncNow(): Promise<void> }>({ syncing: false, lastError: null, syncNow: async () => {} });
export const useSyncStatus = () => useContext(SyncStatusContext);
export const SpacesContext = createContext<Space[]>([]);
export const useSpaces = () => useContext(SpacesContext);

const deviceName = () => { const ua = navigator.userAgent; return /iPhone/.test(ua) ? "iPhone (web)" : /Android/.test(ua) ? "Android (web)" : /Mac/.test(ua) ? "Mac (web)" : "Browser"; };

export function SpaceGate() {
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const spaceId = useSpaceId();
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await listSpaces(); if (!alive) return;
        setSpaces(list); setOffline(false);
        void setCachedSpaces(list);
        const current = await getCurrentSpaceId();
        if (!current || !list.some((s) => s.id === current)) await setCurrentSpaceId((list.find((s) => s.kind === "personal") ?? list[0]!).id);
        void registerDevice({ id: await getDeviceId(), platform: "web", name: deviceName(), app_version: APP_VERSION }).catch(() => {});
      } catch {
        if (!alive) return;
        // Offline (or the server is unreachable): local-first means we still open from
        // whatever we already know — the last-fetched space list, or failing that, just
        // the currentSpace meta a previous session already picked.
        const [cached, current] = await Promise.all([getCachedSpaces(), getCurrentSpaceId()]);
        if (cached) { setSpaces(cached); setOffline(true); }
        else if (current) { setSpaces([]); setOffline(true); }
        else setBootError("Couldn't load your spaces. Check your connection and reload.");
      }
    })();
    return () => { alive = false; };
  }, []);
  const sync = useSync(spaceId);
  const count = useLiveQuery(() => (spaceId ? db.categories.where({ space_id: spaceId }).count() : Promise.resolve(0)), [spaceId]) ?? 0;
  if (bootError && !spaceId) return <div className="empty">{bootError}</div>;
  if (!spaceId || !spaces) return <div className="empty">Loading…</div>;
  if (count === 0 && sync.syncing) return <div className="empty">Fetching your data…</div>;
  return (
    <SpacesContext.Provider value={spaces}>
      <SyncStatusContext.Provider value={sync}>
        {offline && <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-dim)", background: "var(--surface-2)", padding: "6px 12px" }}>Offline — showing saved data</div>}
        <Outlet />
      </SyncStatusContext.Provider>
    </SpacesContext.Provider>
  );
}
