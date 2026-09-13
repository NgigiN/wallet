import { useSyncStatus } from "../app/SpaceGate";
export function SyncBadge() {
  const { syncing, lastError, syncNow } = useSyncStatus();
  const text = syncing ? "Syncing…" : !navigator.onLine ? "Offline" : lastError ?? "Synced";
  return <button className="iconbtn" style={{ fontSize: 12, color: lastError ? "var(--on-hero-out)" : "var(--on-hero-dim)" }} onClick={() => void syncNow()}>{text} ⟳</button>;
}
