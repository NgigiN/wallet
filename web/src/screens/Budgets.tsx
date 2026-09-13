import { useState } from "react";
import { useSpaceId } from "../hooks/useSpace";
import { useSpaceData } from "../hooks/useSpaceData";
import { deleteBudget, setBudget } from "../db/repo";
import { requestSync } from "../sync/useSync";
import { SectionCard } from "../components/SectionCard";
import { Bar } from "../components/Bar";
import { parseKesInput, formatKes } from "../logic/money";
import { range } from "../logic/period";
import { categorySpend } from "../logic/stats";
import { budgetProgress } from "../logic/budget";
import { categoryStyle } from "../theme/categories";
import { copyFor } from "../api/errors";

export function Budgets() {
  const spaceId = useSpaceId(); const { rows, cats, budgets } = useSpaceData(spaceId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const { from, to } = range("month", new Date());
  const byCat = new Map(budgets.map((b) => [b.category_id, b]));
  async function commit(categoryId: string) {
    const text = drafts[categoryId]; if (text === undefined) return;
    const cents = parseKesInput(text); const existing = byCat.get(categoryId);
    const unchanged = existing ? cents === existing.monthly_limit_cents : cents === null;
    if (!unchanged) {
      if (cents) await setBudget(spaceId!, categoryId, cents); else if (existing) await deleteBudget(existing.id);
      requestSync();
    }
    setDrafts(({ [categoryId]: _drop, ...rest }) => rest);
  }
  return (
    <>
      <div className="hero"><div className="dim">Settings</div><div className="big">Budgets</div><div className="dim">Monthly limits per category. You'll see progress on Stats.</div></div>
      <SectionCard title="This month">
        {cats.pickable.filter((c) => c.kind === "expense").map((c) => { const b = byCat.get(c.id); const s = categoryStyle(c); const spend = categorySpend(rows, cats.byId, c.id, from, to); const bp = b ? budgetProgress(spend, b.monthly_limit_cents) : null;
          return <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 20 }}>{s.emoji}</span><div className="title" style={{ flex: 1 }}>{c.name}</div>
              <input inputMode="decimal" placeholder="No limit" style={{ width: 120, padding: 8, borderRadius: 10, border: "1px solid var(--line)" }} value={drafts[c.id] ?? (b ? String(b.monthly_limit_cents / 100) : "")}
                onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })} onBlur={() => void commit(c.id)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /></div>
            {bp && <Bar fraction={bp.fraction} color={bp.level === 2 ? "var(--money-out)" : bp.level === 1 ? "var(--gold)" : s.color} emoji="" label="" value={`${formatKes(spend)} of ${formatKes(b!.monthly_limit_cents)}`} />}
            {b?.sync_state === "error" && <div className="error">{copyFor(b.sync_error ?? "")}</div>}
          </div>; })}
      </SectionCard>
    </>
  );
}
