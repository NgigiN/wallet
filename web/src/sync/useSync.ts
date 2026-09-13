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
// Set the moment sign-out begins. The engine checks it between chunks and pages so a run
// already in flight stops writing rows into a store that is about to be wiped (and stops
// re-creating the cursor meta the clear just removed).
let stopped = false;
const idleWaiters = new Set<() => void>();
export const isStopped = () => stopped;
/** Sign-out: no further runs start, and the one in flight unwinds at its next checkpoint. */
export const stopSync = () => { stopped = true; };
/** A session has started (the hook mounted): syncing is allowed again. */
export const startSync = () => { stopped = false; };
/** Resolves once no run holds the lock, so the caller can clear the local store safely. */
export function awaitSyncIdle(): Promise<void> {
  if (!running) return Promise.resolve();
  return new Promise<void>((resolve) => { idleWaiters.add(resolve); });
}
const releaseIdleWaiters = () => { const waiting = [...idleWaiters]; idleWaiters.clear(); for (const resolve of waiting) resolve(); };

/** Screens call this after a local write; the engine runs 1.5 s later, coalescing bursts. */
export function requestSync() {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => { pending = null; listeners.forEach((l) => l()); }, 1500);
}

export function useSync(spaceId: string | null) {
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const syncNow = useCallback(async () => {
    if (!spaceId || !navigator.onLine || stopped) return;
    if (running) {
      if (Date.now() - runStartedAt <= RUN_WATCHDOG_MS) { rerun = true; return; }
      console.warn(`sync: a run has been in flight for ${Math.round((Date.now() - runStartedAt) / 1000)}s; taking the lock over`);
      running = false; rerun = false;
    }
    running = true; runStartedAt = Date.now(); const token = ++runToken; setSyncing(true);
    try {
      do { rerun = false; await runSync(spaceId, undefined, isStopped); runStartedAt = Date.now(); } while (rerun && !stopped);
      setLastError(null);
    } catch (e) { setLastError(e instanceof ApiError ? copyFor(e.code) : "Sync failed."); }
    finally {
      if (token === runToken) { rerun = false; running = false; releaseIdleWaiters(); }
      setSyncing(false);
    }
  }, [spaceId]);
  useEffect(() => {
    startSync();
    void syncNow();
    const onOnline = () => void syncNow();
    const onVisible = () => { if (document.visibilityState === "visible") void syncNow(); };
    const timer = setInterval(() => void syncNow(), 5 * 60_000);
    window.addEventListener("online", onOnline); document.addEventListener("visibilitychange", onVisible); listeners.add(syncNow);
    return () => { window.removeEventListener("online", onOnline); document.removeEventListener("visibilitychange", onVisible); listeners.delete(syncNow); clearInterval(timer); };
  }, [syncNow]);
  return { syncing, lastError, syncNow };
}
