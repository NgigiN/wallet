import { createAuthClient } from "better-auth/react";
import { clearAllLocalKeepingDevice } from "../db/meta";
import { awaitSyncIdle, stopSync } from "../sync/useSync";

export const authClient = createAuthClient({ baseURL: typeof window === "undefined" ? "http://localhost" : window.location.origin });
export const { useSession } = authClient;

/**
 * The local half of signing out, and the only place that order is decided: stop syncing,
 * let a run already in flight unwind, then wipe this browser's copy of the data. Clearing
 * while the engine is mid-push would drop rows back in behind the wipe.
 */
export async function signOutLocally() {
  stopSync();
  await awaitSyncIdle();
  await clearAllLocalKeepingDevice();
}

/** Sign-out as the user means it: end the server session if we can, then clear locally. */
export async function signOutEverywhere() {
  try { await authClient.signOut(); } catch { /* already expired, or offline — the local clear still has to happen */ }
  await signOutLocally();
}
