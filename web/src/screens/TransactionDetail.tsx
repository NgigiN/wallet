import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalTx } from "../db/schema";
import { editManualTransaction, softDeleteTransaction, tagTransaction } from "../db/repo";
import { requestSync } from "../sync/useSync";
import { useSpaceId } from "../hooks/useSpace";
import { useCategories } from "../hooks/useCategories";
import { CategoryGrid } from "../components/CategoryGrid";
import { Amount } from "../components/Amount";
import { formatKes, parseKesInput } from "../logic/money";
import { copyFor } from "../api/errors";

export function TransactionDetail() {
  const { id } = useParams(); const nav = useNavigate(); const spaceId = useSpaceId();
  const { pickable } = useCategories(spaceId);
  const t = useLiveQuery(() => (id ? db.transactions.get(id) : Promise.resolve(undefined as LocalTx | undefined)), [id]);
  const [cat, setCat] = useState<string | null>(null); const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(""); const [counterparty, setCounterparty] = useState(""); const [when, setWhen] = useState(""); const [dir, setDir] = useState<"in" | "out">("out");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (t) { setCat(t.category_id); setReason(t.reason ?? ""); setAmount(String(t.amount_cents / 100)); setCounterparty(t.counterparty); setWhen(t.occurred_at.slice(0, 16)); setDir(t.direction === "in" ? "in" : "out"); } }, [t?.id]);
  if (!t) return <div className="empty">Not found</div>;
  const manual = t.source === "manual";
  async function save() {
    if (manual) {
      const cents = parseKesInput(amount); if (!cents) { setError("Enter an amount above zero."); return; }
      if (!counterparty.trim()) { setError("Who was this with?"); return; }
      await editManualTransaction(t!.id, { amount_cents: cents, counterparty, occurred_at: new Date(when).toISOString(), direction: dir });
    }
    await tagTransaction(t!.id, cat, reason); requestSync(); nav(-1);
  }
  async function del() { if (confirm("Delete this transaction?")) { await softDeleteTransaction(t!.id); requestSync(); nav("/", { replace: true }); } }
  return (
    <>
      <div className="hero"><div className="dim">{t.counterparty}</div><div className="big"><Amount cents={t.amount_cents} direction={t.direction} /></div>
        <div className="dim">{new Date(t.occurred_at).toLocaleString()} · {t.source}{t.receipt_code ? ` · ${t.receipt_code}` : ""}{t.cost_cents ? ` · fee ${formatKes(t.cost_cents)}` : ""}</div></div>
      {t.sync_state === "error" && <div className="card error">Not synced: {copyFor(t.sync_error ?? "", t.sync_error ?? "")}</div>}
      <div className="card">
        {manual && <>
          <div className="field"><label>Direction</label><select value={dir} onChange={(e) => setDir(e.target.value as "in" | "out")}><option value="out">Money out</option><option value="in">Money in</option></select></div>
          <div className="field"><label>Amount (Ksh)</label><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="field"><label>Counterparty</label><input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} /></div>
          <div className="field"><label>When</label><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div></>}
        <div className="field"><label>Category</label><CategoryGrid categories={pickable} selected={cat} onSelect={setCat} /></div>
        <div className="field"><label>Reason (optional)</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. lunch with Sam" /></div>
        {error && <div className="error">{error}</div>}
        <button className="btn" onClick={() => void save()}>Save</button>
        <button className="btn danger" style={{ marginTop: 8 }} onClick={() => void del()}>Delete</button>
      </div>
    </>
  );
}
