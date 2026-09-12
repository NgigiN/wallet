const fmtWhole = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });
const fmtFrac = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Ksh 2,340" for whole shillings, "Ksh 2,340.50" otherwise, "−Ksh 500" when negative. */
export function formatKes(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  const body = abs % 100 === 0 ? fmtWhole.format(abs / 100) : fmtFrac.format(abs / 100);
  return `${sign}Ksh ${body}`;
}

export const MASKED = "Ksh ••••";

/** "2,340.5" → 234050 cents; null for empty, zero, negative, or non-numeric. Rounds half-up to the cent. */
export function parseKesInput(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return cents > 0 ? cents : null;
}
