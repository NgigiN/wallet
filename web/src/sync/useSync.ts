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
let runStartedAt = 0;
// Identifies the run that currently owns the lock, so a run the watchdog gave up on cannot
// release the lock a later run is holding when it finally settles.
let runToken = 0;
// A run that never settles (a hung request the timeout somehow missed, a thrown-away
// promise) would otherwise wedge `running` for the life of the tab and silently stop every
// later sync. Past this age the lock is assumed dead and taken over.
const RUN_WATCHDOG_MS = 60_000;

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
    if (running) {
      if (Date.now() - runStartedAt <= RUN_WATCHDOG_MS) { rerun = true; return; }
      console.warn(`sync: a run has been in flight for ${Math.round((Date.now() - runStartedAt) / 1000)}s; taking the lock over`);
      running = false; rerun = false;
    }
    running = true; runStartedAt = Date.now(); const token = ++runToken; setSyncing(true);
    try {
      do { rerun = false; await runSync(spaceId); runStartedAt = Date.now(); } while (rerun);
      setLastError(null);
    } catch (e) { setLastError(e instanceof ApiError ? copyFor(e.code) : "Sync failed."); }
    finally { if (token === runToken) { rerun = false; running = false; } setSyncing(false); }
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
