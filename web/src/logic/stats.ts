import type { LocalCategory, LocalTx } from "../db/schema";
import { toDayKey } from "./dates";

type Cats = Map<string, LocalCategory>;
const inRange = (t: LocalTx, from: number, to: number) => { const ms = Date.parse(t.occurred_at); return ms >= from && ms < to; };
const isTransfer = (t: LocalTx, cats: Cats) => t.direction === "transfer" || (t.category_id != null && cats.get(t.category_id)?.kind === "transfer");
const outCents = (t: LocalTx) => t.amount_cents + t.cost_cents;
/** Spend rows: out, not transfer, in range, not deleted. */
export const spendRows = (rows: LocalTx[], cats: Cats, from: number, to: number) => rows.filter((t) => !t.deleted_at && t.direction === "out" && !isTransfer(t, cats) && inRange(t, from, to));

export function totals(rows: LocalTx[], cats: Cats, from: number, to: number) {
  let moneyIn = 0, moneyOut = 0;
  for (const t of rows) {
    if (t.deleted_at || !inRange(t, from, to) || isTransfer(t, cats)) continue;
    if (t.direction === "in") moneyIn += t.amount_cents; else if (t.direction === "out") moneyOut += outCents(t);
  }
  return { moneyIn, moneyOut };
}
export function categoryTotals(rows: LocalTx[], cats: Cats, from: number, to: number) {
  const acc = new Map<string, number>();
  for (const t of spendRows(rows, cats, from, to)) if (t.category_id) acc.set(t.category_id, (acc.get(t.category_id) ?? 0) + outCents(t));
  return [...acc].map(([categoryId, total]) => ({ categoryId, name: cats.get(categoryId)?.name ?? "?", total })).sort((a, b) => b.total - a.total);
}
export function dailyTotals(rows: LocalTx[], cats: Cats, from: number, to: number) {
  const acc = new Map<string, number>();
  for (let d = new Date(from); d.getTime() < to; d.setDate(d.getDate() + 1)) acc.set(toDayKey(d), 0);
  for (const t of spendRows(rows, cats, from, to)) { const k = toDayKey(t.occurred_at); acc.set(k, (acc.get(k) ?? 0) + outCents(t)); }
  return [...acc].map(([day, total]) => ({ day, total }));
}
export const topDays = (rows: LocalTx[], cats: Cats, from: number, to: number, n = 3) => dailyTotals(rows, cats, from, to).filter((d) => d.total > 0).sort((a, b) => b.total - a.total).slice(0, n);
export const biggestExpenses = (rows: LocalTx[], cats: Cats, from: number, to: number, n = 5) => spendRows(rows, cats, from, to).sort((a, b) => outCents(b) - outCents(a)).slice(0, n);
export function topCounterparties(rows: LocalTx[], cats: Cats, from: number, to: number, n = 5) {
  const acc = new Map<string, number>();
  for (const t of spendRows(rows, cats, from, to)) acc.set(t.counterparty, (acc.get(t.counterparty) ?? 0) + outCents(t));
  return [...acc].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, n);
}
export const categorySpend = (rows: LocalTx[], cats: Cats, categoryId: string, from: number, to: number) => spendRows(rows, cats, from, to).filter((t) => t.category_id === categoryId).reduce((s, t) => s + outCents(t), 0);
