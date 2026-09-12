import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalTx } from "../db/schema";
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
  const rows = useLiveQuery(() => (spaceId ? db.transactions.where({ space_id: spaceId }).toArray() : Promise.resolve([] as LocalTx[])), [spaceId]) ?? [];
  const live = rows.filter((t) => !t.deleted_at);
  const untagged = live.filter((t) => !t.category_id && t.direction !== "transfer").sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const recent = live.filter((t) => t.category_id || t.direction === "transfer").sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const now = new Date(); const { from, to } = range("month", now); const t = totals(live, byId, from, to);
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
