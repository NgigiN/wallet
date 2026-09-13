import { Link } from "react-router";
import type { LocalCategory, LocalTx } from "../db/schema";
import { Amount } from "./Amount";
import { categoryStyle } from "../theme/categories";
import { timeAgo } from "../logic/dates";
export function TxRow({ t, cat }: { t: LocalTx; cat?: LocalCategory }) {
  const s = t.category_id ? categoryStyle(cat) : { emoji: t.sync_error ? "❗" : "🧾", color: "var(--cat-fallback)" };
  return (
    <Link to={`/tx/${t.id}`} className="row" style={{ textDecoration: "none" }}>
      <span style={{ fontSize: 22 }}>{s.emoji}</span>
      <div className="grow"><div className="title">{t.counterparty}</div><div className="sub">{cat?.name ?? (t.sync_error ? "Needs attention" : "Untagged")} · {timeAgo(t.occurred_at)}{t.reason ? ` · ${t.reason}` : ""}</div></div>
      <Amount cents={t.direction === "in" ? t.amount_cents : -(t.amount_cents + t.cost_cents)} direction={t.direction} />
    </Link>
  );
}
