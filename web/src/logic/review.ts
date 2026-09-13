import type { LocalCategory, LocalTx } from "../db/schema";
import { categoryTotals, totals } from "./stats";
import { label, range, step, type Period } from "./period";

export const savingsRate = (moneyIn: number, moneyOut: number) => (moneyIn <= 0 ? null : (moneyIn - moneyOut) / moneyIn);
export function trendSeries(rows: LocalTx[], cats: Map<string, LocalCategory>, period: Period, ref: Date, count: number) {
  const points = []; let cursor = ref;
  for (let i = 0; i < count; i++) {
    const { from, to } = range(period, cursor); const t = totals(rows, cats, from, to);
    points.push({ label: label(period, cursor), ref: cursor, moneyOut: t.moneyOut, savingsRate: savingsRate(t.moneyIn, t.moneyOut) });
    cursor = step(period, cursor, -1);
  }
  return points.reverse();
}
export function categoryMovers(rows: LocalTx[], cats: Map<string, LocalCategory>, period: Period, ref: Date, limit = 3) {
  const cur = range(period, ref), prev = range(period, step(period, ref, -1));
  const current = new Map(categoryTotals(rows, cats, cur.from, cur.to).map((c) => [c.categoryId, c.total]));
  const previous = new Map(categoryTotals(rows, cats, prev.from, prev.to).map((c) => [c.categoryId, c.total]));
  return [...new Set([...current.keys(), ...previous.keys()])].map((id) => {
    const c = current.get(id) ?? 0, p = previous.get(id) ?? 0;
    return { categoryId: id, name: cats.get(id)?.name ?? "?", current: c, previous: p, percentChange: p > 0 ? Math.round(((c - p) / p) * 100) : null, isNew: p === 0 && c > 0 };
  }).sort((a, b) => (b.percentChange === null ? Infinity : Math.abs(b.percentChange)) - (a.percentChange === null ? Infinity : Math.abs(a.percentChange))).slice(0, limit);
}
export function heatmapBuckets(daily: { day: string; total: number }[]): Record<string, number> {
  const nz = daily.filter((d) => d.total > 0).map((d) => d.total).sort((a, b) => a - b);
  const out: Record<string, number> = {};
  for (const d of daily) {
    if (d.total <= 0 || nz.length === 0) { out[d.day] = 0; continue; }
    const idx = Math.max(0, nz.findIndex((v) => v >= d.total));
    out[d.day] = Math.min(3, Math.floor((idx * 4) / nz.length)) + 1;
  }
  return out;
}
export function paceProjection(spentSoFar: number, from: number, to: number, now: number): number | null {
  if (now < from || now >= to) return null;
  const f = (now - from) / (to - from);
  return f <= 0 ? null : spentSoFar / f;
}
