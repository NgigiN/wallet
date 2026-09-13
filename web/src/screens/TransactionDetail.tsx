import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Direction, type LocalTx } from "../db/schema";
import { editManualTransaction, softDeleteTransaction, tagTransaction } from "../db/repo";
import { requestSync } from "../sync/useSync";
import { useSpaceId } from "../hooks/useSpace";
import { useCategories } from "../hooks/useCategories";
import { CategoryGrid } from "../components/CategoryGrid";
import { Amount } from "../components/Amount";
import { formatKes, parseKesInput } from "../logic/money";
import { fromLocalInput, toLocalInput } from "../logic/dates";
import { copyFor } from "../api/errors";

export function TransactionDetail() {
  const { id } = useParams(); const nav = useNavigate(); const spaceId = useSpaceId();
  const { pickable } = useCategories(spaceId);
  const t = useLiveQuery(() => (id ? db.transactions.get(id) : Promise.resolve(undefined as LocalTx | undefined)), [id]);
  const [cat, setCat] = useState<string | null>(null); const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(""); const [counterparty, setCounterparty] = useState(""); const [when, setWhen] = useState(""); const [dir, setDir] = useState<Direction>("out");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (t) { setCat(t.category_id); setReason(t.reason ?? ""); setAmount(String(t.amount_cents / 100)); setCounterparty(t.counterparty); setWhen(toLocalInput(t.occurred_at)); setDir(t.direction); } }, [t?.id]);
  if (!t) return <div className="empty">Not found</div>;
  const manual = t.source === "manual";
  // A transfer keeps whatever direction it arrived with: the control below only offers
  // in/out, so showing it for a transfer would silently demote the row to an expense.
  const transfer = t.direction === "transfer";
  async function save() {
    setError(null);
    try {
      if (manual) {
        const cents = parseKesInput(amount); if (!cents) { setError("Enter an amount above zero."); return; }
        if (!counterparty.trim()) { setError("Who was this with?"); return; }
        const occurredAt = fromLocalInput(when); if (!occurredAt) { setError("Pick a date and time."); return; }
        await editManualTransaction(t!.id, { amount_cents: cents, counterparty, occurred_at: occurredAt, ...(transfer ? {} : { direction: dir }) });
      }
      await tagTransaction(t!.id, cat, reason); requestSync(); nav(-1);
    } catch { setError("Couldn't save that. Try again."); }
  }
  async function del() {
    if (!confirm("Delete this transaction?")) return;
    setError(null);
    try { await softDeleteTransaction(t!.id); requestSync(); nav("/", { replace: true }); }
    catch { setError("Couldn't delete that. Try again."); }
  }
  return (
    <>
      <div className="hero"><div className="dim">{t.counterparty}</div><div className="big"><Amount cents={t.amount_cents} direction={t.direction} /></div>
        <div className="dim">{new Date(t.occurred_at).toLocaleString()} · {t.source}{t.receipt_code ? ` · ${t.receipt_code}` : ""}{t.cost_cents ? ` · fee ${formatKes(t.cost_cents)}` : ""}</div></div>
      {t.sync_error && <div className="card error">Not synced: {copyFor(t.sync_error)}</div>}
      <div className="card">
        {manual && <>
          {!transfer && <div className="field"><label htmlFor="tx-dir">Direction</label><select id="tx-dir" value={dir} onChange={(e) => setDir(e.target.value as Direction)}><option value="out">Money out</option><option value="in">Money in</option></select></div>}
          <div className="field"><label htmlFor="tx-amount">Amount (Ksh)</label><input id="tx-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="field"><label htmlFor="tx-counterparty">Counterparty</label><input id="tx-counterparty" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} /></div>
          <div className="field"><label htmlFor="tx-when">When</label><input id="tx-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div></>}
        <div className="field"><label>Category</label><CategoryGrid categories={pickable} selected={cat} onSelect={setCat} /></div>
        <div className="field"><label htmlFor="tx-reason">Reason (optional)</label><input id="tx-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. lunch with Sam" /></div>
        {error && <div className="error">{error}</div>}
        <button className="btn" onClick={() => void save()}>Save</button>
        <button className="btn danger" style={{ marginTop: 8 }} onClick={() => void del()}>Delete</button>
      </div>
    </>
  );
}
