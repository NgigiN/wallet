import type { LocalCategory, LocalTx } from "../db/schema";
import { SectionCard } from "../components/SectionCard";
import { formatKes } from "../logic/money";
import { range, type Period } from "../logic/period";
import { dailyTotals, totals } from "../logic/stats";
import { categoryMovers, heatmapBuckets, paceProjection, trendSeries } from "../logic/review";
import { dayLabel } from "../logic/dates";
import { categoryStyle } from "../theme/categories";

const STEPS = [0, 25, 45, 65, 90];
export function ReviewTab({ rows, cats, period, refDate }: { rows: LocalTx[]; cats: Map<string, LocalCategory>; period: Period; refDate: Date }) {
  const series = trendSeries(rows, cats, period, refDate, 8); const max = Math.max(1, ...series.map((s) => s.moneyOut));
  const movers = categoryMovers(rows, cats, period, refDate);
  const { from, to } = range(period, refDate); const now = Date.now(); const pace = paceProjection(totals(rows, cats, from, to).moneyOut, from, to, now);
  const yearAgo = new Date(refDate); yearAgo.setFullYear(yearAgo.getFullYear() - 1); yearAgo.setDate(1);
  const daily = dailyTotals(rows, cats, yearAgo.getTime(), range("month", refDate).to); const buckets = heatmapBuckets(daily);
  const lead = (new Date(daily[0]?.day ?? refDate).getDay() + 6) % 7;
  return (
    <>
      <SectionCard title="Spend trend">
        <div className="trend">{series.map((s, i) => <div key={s.label} className={`col ${i === series.length - 1 ? "cur" : ""}`} title={`${s.label}: ${formatKes(s.moneyOut)}`}><div className="vbar" style={{ height: `${Math.max(2, (s.moneyOut / max) * 80)}%` }} />{i === series.length - 1 && <div className="lbl">{formatKes(s.moneyOut)}</div>}</div>)}</div>
        <div className="sub" style={{ marginTop: 8 }}>Savings rate: {series.map((s) => { if (s.savingsRate === null) return "—"; const pct = Math.round(s.savingsRate * 100); return pct < 0 ? `−${Math.abs(pct)}%` : `${pct}%`; }).join(" · ")}</div>
      </SectionCard>
      <SectionCard title="Category movers">
        {movers.length === 0 ? <div className="sub">Not enough history yet.</div> : movers.map((m) => { const s = categoryStyle(cats.get(m.categoryId)); return <div key={m.categoryId} className="row"><span>{s.emoji}</span><div className="grow"><div className="title">{m.name}</div><div className="sub">{formatKes(m.current)} vs {formatKes(m.previous)}</div></div><span className="badge">{m.isNew ? "new" : `${m.percentChange! >= 0 ? "+" : "−"}${Math.abs(m.percentChange!)}%`}</span></div>; })}
      </SectionCard>
      {pace !== null && <SectionCard title="Pace"><div className="title">At this pace: {formatKes(Math.round(pace))} by period end</div></SectionCard>}
      <SectionCard title="Spend calendar">
        <div className="heat" role="img" aria-label="Daily spend for the last 12 months">
          {Array.from({ length: lead }, (_, i) => <i key={`lead${i}`} style={{ visibility: "hidden" }} />)}
          {daily.map((d) => <i key={d.day} title={`${dayLabel(d.day)}: ${formatKes(d.total)}`} style={{ ["--cell" as any]: `color-mix(in srgb, var(--accent) ${STEPS[buckets[d.day] ?? 0]}%, var(--surface-2))` }} />)}
        </div>
        <div className="sub">less → more</div>
      </SectionCard>
    </>
  );
}
