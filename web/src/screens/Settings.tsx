import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { authClient, useSession } from "../api/auth";
import { APP_VERSION } from "../api/client";
import { listDevices, type DeviceWire } from "../api/devices";
import { clearAllLocal, getLastSyncAt } from "../db/meta";
import { useSpaceId } from "../hooks/useSpace";
import { useSpaces, useSyncStatus } from "../app/SpaceGate";
import { SectionCard } from "../components/SectionCard";
import { InstallHint } from "../components/InstallHint";
import { timeAgo } from "../logic/dates";

export function Settings() {
  const { data } = useSession(); const nav = useNavigate(); const spaceId = useSpaceId(); const spaces = useSpaces(); const { syncing, syncNow, lastError } = useSyncStatus();
  const [devices, setDevices] = useState<DeviceWire[]>([]);
  const lastSync = useLiveQuery(() => (spaceId ? getLastSyncAt(spaceId) : Promise.resolve(null)), [spaceId]);
  useEffect(() => { void listDevices().then(setDevices).catch(() => {}); }, []);
  const space = spaces.find((s) => s.id === spaceId);
  async function signOut() { await authClient.signOut(); await clearAllLocal(); nav("/sign-in", { replace: true }); }
  return (
    <>
      <div className="hero"><div className="dim">{data?.user.email}</div><div className="big">{data?.user.name ?? "You"}</div><div className="dim">Space: {space?.name ?? "—"} ({space?.kind ?? ""})</div></div>
      <InstallHint />
      <SectionCard title="Manage">
        <Link className="row" to="/categories"><div className="grow title">Categories</div>›</Link>
        <Link className="row" to="/budgets"><div className="grow title">Budgets</div>›</Link>
        <Link className="row" to="/privacy"><div className="grow title">Privacy</div>›</Link>
      </SectionCard>
      <SectionCard title="Sync" action={<button className="btn secondary" style={{ width: "auto", padding: "6px 12px" }} disabled={syncing} onClick={() => void syncNow()}>{syncing ? "Syncing…" : "Sync now"}</button>}>
        <div className="sub">{lastError ?? (lastSync ? `Last synced ${timeAgo(lastSync)}` : "Not synced yet")}</div>
      </SectionCard>
      <SectionCard title="Devices">{devices.map((d) => <div key={d.id} className="row"><div className="grow"><div className="title">{d.name}</div><div className="sub">{d.platform} · v{d.app_version} · seen {timeAgo(d.last_seen_at)}</div></div></div>)}</SectionCard>
      <SectionCard title="About"><div className="sub">Wallet web v{APP_VERSION}</div><button className="btn danger" style={{ marginTop: 12 }} onClick={() => void signOut()}>Sign out</button></SectionCard>
    </>
  );
}
