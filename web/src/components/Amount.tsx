import { formatKes, MASKED } from "../logic/money";
import { useMask } from "../hooks/useMask";

export function Amount({ cents, direction, masked = false, className = "" }:
  { cents: number; direction?: "in" | "out" | "transfer"; masked?: boolean; className?: string }) {
  const { hidden } = useMask();
  const tone = direction === "in" ? "money-in" : direction === "out" ? "money-out" : "";
  return <span className={`amount ${tone} ${className}`}>{masked && hidden ? MASKED : formatKes(cents)}</span>;
}
