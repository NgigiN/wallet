import type { LocalCategory, LocalTx } from "../db/schema";
import type { Period } from "../logic/period";

/** Placeholder — Task 10 replaces this with the review tab. */
export function ReviewTab(_: { rows: LocalTx[]; cats: Map<string, LocalCategory>; period: Period; refDate: Date }) {
  return <div className="empty">Review</div>;
}
