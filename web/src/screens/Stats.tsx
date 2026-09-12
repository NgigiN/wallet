import { useState } from "react";
import { useSpaceId } from "../hooks/useSpace";
import { useSpaceData } from "../hooks/useSpaceData";
import { useMask } from "../hooks/useMask";
import { Amount } from "../components/Amount";
import { Bar } from "../components/Bar";
import { PeriodNav } from "../components/PeriodNav";
import { SectionCard } from "../components/SectionCard";
import { EmptyState } from "../components/EmptyState";
import { ReviewTab } from "./ReviewTab";
import { range, step, type Period } from "../logic/period";
import { biggestExpenses, categoryTotals, topCounterparties, topDays, totals } from "../logic/stats";
import { budgetProgress } from "../logic/budget";
import { formatKes } from "../logic/money";
import { dayLabel, toDayKey } from "../logic/dates";
import { categoryStyle } from "../theme/categories";

export function Stats() {
  const spaceId = useSpaceId(); const { rows, cats, budgets, earliest } = useSpaceData(spaceId);
  const [tab, setTab] = useState<"period" | "review">("period");
  const [period, setPeriod] = useState<Period>("month"); const [ref, setRef] = useState(new Date());
  const { hidden, toggle } = useMask();
  const { from, to } = range(period, ref); const prev = range(period, step(period, ref, -1));
  const t = totals(rows, cats.byId, from, to); const p = totals(rows, cats.byId, prev.from, prev.to);
  const delta = p.moneyOut > 0 ? Math.round(((t.moneyOut - p.moneyOut) / p.moneyOut) * 100) : null;
  const byCat = categoryTotals(rows, cats.byId, from, to); const maxCat = byCat[0]?.total ?? 1;
  const budgetByCat = new Map(budgets.map((b) => [b.category_id, b]));
  const empty = t.moneyIn === 0 && t.moneyOut === 0;
  return (
    <>
      <div className="hero">
        <div className="dim">Money out</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span className="big"><Amount cents={t.moneyOut} masked /></span><button className="iconbtn" onClick={toggle}>{hidden ? "👁" : "🙈"}</button></div>
        <div className="dim">In: <Amount cents={t.moneyIn} masked />{delta !== null && !hidden && <> · {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs previous</>}</div>
      </div>
      <div className="tabs"><button className={tab === "period" ? "on" : ""} onClick={() => setTab("period")}>Period</button><button className={tab === "review" ? "on" : ""} onClick={() => setTab("review")}>Review</button></div>
      {tab === "review" ? <ReviewTab rows={rows} cats={cats.byId} period={period} refDate={ref} /> : <>
        <PeriodNav period={period} refDate={ref} earliest={earliest} onChange={(p, r) => { setPeriod(p); setRef(r); }} />
        {empty ? <EmptyState title="Nothing here yet" hint="Nothing to show for this period." /> : <>
          <SectionCard title="Where it went">
            {byCat.map((c) => { const cat = cats.byId.get(c.categoryId); const s = categoryStyle(cat); const b = period === "month" ? budgetByCat.get(c.categoryId) : undefined;
              if (b) { const bp = budgetProgress(c.total, b.monthly_limit_cents); const color = bp.level === 2 ? "var(--money-out)" : bp.level === 1 ? "var(--gold)" : s.color;
                return <Bar key={c.categoryId} fraction={bp.fraction} color={color} emoji={s.emoji} label={c.name} value={formatKes(c.total)} sub={`${Math.round((c.total / b.monthly_limit_cents) * 100)}% of ${formatKes(b.monthly_limit_cents)}`} />; }
              return <Bar key={c.categoryId} fraction={c.total / maxCat} color={s.color} emoji={s.emoji} label={c.name} value={formatKes(c.total)} sub={`${Math.round((c.total / Math.max(1, t.moneyOut)) * 100)}% of spend`} />; })}
            {byCat.length === 0 && <div className="sub">{t.moneyOut > 0 ? "Everything in this period is untagged." : "No spending this period."}</div>}
          </SectionCard>
          <SectionCard title="Top spending days">{topDays(rows, cats.byId, from, to).map((d) => <div key={d.day} className="row"><div className="grow title">{dayLabel(d.day)}</div><span>{formatKes(d.total)}</span></div>)}</SectionCard>
          <SectionCard title="Biggest expenses">{biggestExpenses(rows, cats.byId, from, to).map((x) => <div key={x.id} className="row"><span>{categoryStyle(x.category_id ? cats.byId.get(x.category_id) : undefined).emoji}</span><div className="grow"><div className="title">{x.counterparty}</div><div className="sub">{dayLabel(toDayKey(x.occurred_at))}</div></div><span>{formatKes(x.amount_cents + x.cost_cents)}</span></div>)}</SectionCard>
          <SectionCard title="Top counterparties">{topCounterparties(rows, cats.byId, from, to).map((c) => <div key={c.name} className="row"><div className="grow title">{c.name}</div><span>{formatKes(c.total)}</span></div>)}</SectionCard>
        </>}
      </>}
    </>
  );
}
