import { useCallback, useEffect, useRef, useState } from "react";
import { runSync } from "./engine";
import { ApiError } from "../api/client";
import { copyFor } from "../api/errors";

let pending: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
/** Screens call this after a local write; the engine runs 1.5 s later, coalescing bursts. */
export function requestSync() {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => { pending = null; listeners.forEach((l) => l()); }, 1500);
}

export function useSync(spaceId: string | null) {
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const running = useRef(false);
  const syncNow = useCallback(async () => {
    if (!spaceId || running.current || !navigator.onLine) return;
    running.current = true; setSyncing(true);
    try { await runSync(spaceId); setLastError(null); }
    catch (e) { setLastError(e instanceof ApiError ? copyFor(e.code) : "Sync failed."); }
    finally { running.current = false; setSyncing(false); }
  }, [spaceId]);
  useEffect(() => {
    void syncNow();
    const onOnline = () => void syncNow();
    const onVisible = () => { if (document.visibilityState === "visible") void syncNow(); };
    const timer = setInterval(() => void syncNow(), 5 * 60_000);
    window.addEventListener("online", onOnline); document.addEventListener("visibilitychange", onVisible); listeners.add(syncNow);
    return () => { window.removeEventListener("online", onOnline); document.removeEventListener("visibilitychange", onVisible); listeners.delete(syncNow); clearInterval(timer); };
  }, [syncNow]);
  return { syncing, lastError, syncNow };
}
