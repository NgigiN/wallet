const pad = (n: number) => String(n).padStart(2, "0");
export const toDayKey = (iso: string | Date) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const dayKeyToDate = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(y!, m! - 1, d!); };
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-01" → "Tue 1 Sep" */
export const dayLabel = (key: string) => { const d = dayKeyToDate(key); return `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
export const monthDay = (d: Date) => `${MON[d.getMonth()]} ${d.getDate()}`;
export function timeAgo(iso: string, now = Date.now()) {
  const then = Date.parse(iso), diff = now - then, d = new Date(then);
  if (diff < 60_000) return "Just now"; if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`; if (diff < 7 * 86_400_000) return WD[d.getDay()]!;
  return `${d.getDate()} ${MON[d.getMonth()]}`;
}
