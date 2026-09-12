import { monthDay } from "./dates";
export type Period = "week" | "month" | "year";
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const monday = (d: Date) => { const s = startOfDay(d); const off = (s.getDay() + 6) % 7; s.setDate(s.getDate() - off); return s; };

export function range(period: Period, ref: Date): { from: number; to: number } {
  let start: Date, end: Date;
  if (period === "week") { start = monday(ref); end = new Date(start); end.setDate(end.getDate() + 7); }
  else if (period === "month") { start = new Date(ref.getFullYear(), ref.getMonth(), 1); end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1); }
  else { start = new Date(ref.getFullYear(), 0, 1); end = new Date(ref.getFullYear() + 1, 0, 1); }
  return { from: start.getTime(), to: end.getTime() };
}
export function step(period: Period, ref: Date, dir: -1 | 1): Date {
  const d = new Date(ref);
  if (period === "week") d.setDate(d.getDate() + 7 * dir);
  else if (period === "month") { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + dir); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  else d.setFullYear(d.getFullYear() + dir);
  return d;
}
export function isoWeek(d: Date): { week: number; year: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { week: Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7), year: t.getUTCFullYear() };
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function label(period: Period, ref: Date, today = new Date()): string {
  if (period === "month") return `${MONTHS[ref.getMonth()]} ${ref.getFullYear()}`;
  if (period === "year") return String(ref.getFullYear());
  const mon = monday(ref); const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
  const w = isoWeek(ref), tw = isoWeek(today);
  const dates = mon.getMonth() === sun.getMonth() ? `${monthDay(mon)}–${sun.getDate()}` : `${monthDay(mon)}–${monthDay(sun)}`;
  const sofar = w.week === tw.week && w.year === tw.year ? " (so far)" : "";
  return `Week ${w.week} · ${dates}${sofar}`;
}
export function periodsInRange(period: Period, earliest: Date, today = new Date()): Date[] {
  if (earliest > today) return [today];
  const out: Date[] = []; let cursor = today;
  for (;;) {
    out.push(cursor);
    const boundary = new Date(range(period, cursor).from);
    if (boundary <= startOfDay(earliest)) break;
    cursor = step(period, cursor, -1);
  }
  return out;
}
