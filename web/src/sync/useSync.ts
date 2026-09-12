import { useCallback, useEffect, useState } from "react";
import { runSync } from "./engine";
import { ApiError } from "../api/client";
import { copyFor } from "../api/errors";

let pending: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
// Module level, not a per-hook ref: two mounted hooks (or a trigger firing during a run)
// must never overlap two runSync passes over the same tables. `rerun` records that work
// arrived mid-run so the engine goes round once more instead of dropping it.
let running = false;
let rerun = false;

/** Screens call this after a local write; the engine runs 1.5 s later, coalescing bursts. */
export function requestSync() {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => { pending = null; listeners.forEach((l) => l()); }, 1500);
}

export function useSync(spaceId: string | null) {
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const syncNow = useCallback(async () => {
    if (!spaceId || !navigator.onLine) return;
    if (running) { rerun = true; return; }
    running = true; setSyncing(true);
    try {
      do { rerun = false; await runSync(spaceId); } while (rerun);
      setLastError(null);
    } catch (e) { setLastError(e instanceof ApiError ? copyFor(e.code) : "Sync failed."); }
    finally { rerun = false; running = false; setSyncing(false); }
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
