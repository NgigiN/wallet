import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalTx } from "../db/schema";
import { txWindow } from "../db/queries";
import { useSpaceId } from "../hooks/useSpace";
import { useCategories } from "../hooks/useCategories";
import { useMask } from "../hooks/useMask";
import { Amount } from "../components/Amount";
import { TxRow } from "../components/TxRow";
import { SyncBadge } from "../components/SyncBadge";
import { SectionCard } from "../components/SectionCard";
import { EmptyState } from "../components/EmptyState";
import { totals } from "../logic/stats";
import { range, label } from "../logic/period";

export function Inbox() {
  const spaceId = useSpaceId();
  const { byId } = useCategories(spaceId);
  const { hidden, toggle } = useMask();
  const [limit, setLimit] = useState(50);
  const now = new Date(); const { from, to } = range("month", now);
  const fromIso = new Date(from).toISOString(), toIso = new Date(to).toISOString();
  // The untagged list is the one read with no bound: it is small by construction (the whole
  // point of the screen is to empty it) and there is no index on "has no category".
  const untaggedRows = useLiveQuery(() => (spaceId ? db.transactions.where({ space_id: spaceId }).filter((t) => t.category_id == null && !t.deleted_at && t.direction !== "transfer").toArray() : Promise.resolve([] as LocalTx[])), [spaceId]) ?? [];
  const untagged = useMemo(() => [...untaggedRows].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)), [untaggedRows]);
  // "Recent" never shows more than a couple of screens' worth, so take the newest 200 off
  // the [space_id+occurred_at] index rather than loading the space's whole history.
  const newest = useLiveQuery(() => (spaceId ? txWindow(spaceId).reverse().limit(200).toArray() : Promise.resolve([] as LocalTx[])), [spaceId]) ?? [];
  const recent = useMemo(() => newest.filter((t) => !t.deleted_at && (t.category_id || t.direction === "transfer")), [newest]);
  const monthRows = useLiveQuery(() => (spaceId ? txWindow(spaceId, fromIso, toIso).toArray() : Promise.resolve([] as LocalTx[])), [spaceId, fromIso, toIso]) ?? [];
  const t = totals(monthRows, byId, from, to);
  return (
    <>
      <div className="hero">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="dim">{label("month", now)}</span><SyncBadge /></div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span className="big"><Amount cents={t.moneyOut} masked /></span><span className="dim">out</span>
          <button className="iconbtn" aria-label={hidden ? "Show amounts" : "Hide amounts"} onClick={toggle}>{hidden ? "👁" : "🙈"}</button></div>
        <div className="dim">In: <Amount cents={t.moneyIn} masked /></div>
      </div>
      {untagged.length > 0 && <SectionCard title="Needs a category">{untagged.map((x) => <TxRow key={x.id} t={x} />)}</SectionCard>}
      <SectionCard title="Recent">
        {recent.length === 0 && untagged.length === 0 ? <EmptyState title="Nothing here yet" hint="Add a transaction or sync your phone." /> :
          <>{recent.slice(0, limit).map((x) => <TxRow key={x.id} t={x} cat={x.category_id ? byId.get(x.category_id) : undefined} />)}
            {recent.length > limit && <button className="btn secondary" onClick={() => setLimit((l) => l + 50)}>Show more</button>}</>}
      </SectionCard>
    </>
  );
}
