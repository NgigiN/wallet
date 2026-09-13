import type { LocalRule } from "../db/schema";
import { normaliseCounterparty } from "../db/repo";

/** First live rule (not soft-deleted) whose normalised counterparty matches; null when none. */
export function matchRule(rules: LocalRule[], counterparty: string): string | null {
  const key = normaliseCounterparty(counterparty);
  return rules.find((r) => !r.deleted_at && r.match_counterparty === key)?.category_id ?? null;
}
