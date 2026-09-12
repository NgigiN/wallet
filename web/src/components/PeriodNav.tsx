import { useState } from "react";
import { Sheet } from "./Sheet";
import { label, periodsInRange, step, type Period } from "../logic/period";
export function PeriodNav({ period, refDate, earliest, onChange }: { period: Period; refDate: Date; earliest: Date; onChange(p: Period, r: Date): void }) {
  const [jump, setJump] = useState(false);
  const today = new Date(); const atLatest = step(period, refDate, 1) > today;
  return (
    <>
      <div className="seg">{(["week", "month", "year"] as Period[]).map((p) => <button key={p} className={p === period ? "on" : ""} onClick={() => onChange(p, today)}>{p[0]!.toUpperCase() + p.slice(1)}</button>)}</div>
      <div className="pnav"><button className="iconbtn" aria-label="Previous" onClick={() => onChange(period, step(period, refDate, -1))}>‹</button>
        <button className="title iconbtn" onClick={() => setJump(true)}>{label(period, refDate)}</button>
        <button className="iconbtn" aria-label="Next" disabled={atLatest} onClick={() => onChange(period, step(period, refDate, 1))}>›</button></div>
      <Sheet open={jump} onClose={() => setJump(false)}>
        {periodsInRange(period, earliest).map((r) => <button key={r.toISOString()} className="row" style={{ width: "100%", background: "none", border: "none", textAlign: "left" }} onClick={() => { onChange(period, r); setJump(false); }}>{label(period, r)}</button>)}
      </Sheet>
    </>
  );
}
