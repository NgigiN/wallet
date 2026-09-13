import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalRule, type LocalTx } from "../db/schema";
import { createManualTransaction } from "../db/repo";
import { txWindow } from "../db/queries";
import { requestSync } from "../sync/useSync";
import { useSpaceId } from "../hooks/useSpace";
import { useCategories } from "../hooks/useCategories";
import { CategoryGrid } from "../components/CategoryGrid";
import { parseKesInput } from "../logic/money";
import { matchRule } from "../logic/rules";
import { fromLocalInput, toLocalInput } from "../logic/dates";

const localNow = () => toLocalInput(new Date());

export function AddTransaction() {
  const nav = useNavigate(); const spaceId = useSpaceId(); const { pickable } = useCategories(spaceId);
  const rules = useLiveQuery(() => (spaceId ? db.rules.where({ space_id: spaceId }).toArray() : Promise.resolve([] as LocalRule[])), [spaceId]) ?? [];
  // Newest 50 straight off the [space_id+occurred_at] index: the datalist below shows 20
  // names, so loading (and sorting) the whole table for it was pure waste.
  const recent = useLiveQuery(() => (spaceId ? txWindow(spaceId).reverse().limit(50).toArray() : Promise.resolve([] as LocalTx[])), [spaceId]) ?? [];
  const suggestions = useMemo(() => [...new Set(recent.filter((t) => !t.deleted_at).map((t) => t.counterparty))].slice(0, 20), [recent]);
  const [dir, setDir] = useState<"out" | "in">("out"); const [amount, setAmount] = useState(""); const [counterparty, setCounterparty] = useState("");
  const [when, setWhen] = useState(localNow()); const [cat, setCat] = useState<string | null>(null); const [picked, setPicked] = useState(false); const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!picked) setCat(matchRule(rules, counterparty)); }, [counterparty, rules, picked]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const cents = parseKesInput(amount); if (!cents) { setError("Enter an amount above zero."); return; }
      if (!counterparty.trim()) { setError("Who was this with?"); return; }
      const occurredAt = fromLocalInput(when); if (!occurredAt) { setError("Pick a date and time."); return; }
      await createManualTransaction(spaceId!, { direction: dir, amount_cents: cents, counterparty, occurred_at: occurredAt, category_id: cat, reason: reason || null });
      requestSync(); nav("/", { replace: true });
    } catch { setError("Couldn't save that. Try again."); }
  }
  return (
    <form onSubmit={save}>
      <div className="hero"><div className="dim">New transaction</div><div className="big">Add</div></div>
      <div className="card">
        <div className="field"><label>Direction</label><div className="grid3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <button type="button" className={`chip ${dir === "out" ? "selected" : ""}`} style={{ ["--chip-color" as any]: "var(--money-out)", justifyContent: "center" }} onClick={() => setDir("out")}>Money out</button>
          <button type="button" className={`chip ${dir === "in" ? "selected" : ""}`} style={{ ["--chip-color" as any]: "var(--money-in)", justifyContent: "center" }} onClick={() => setDir("in")}>Money in</button></div></div>
        <div className="field"><label htmlFor="add-amount">Amount (Ksh)</label><input id="add-amount" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></div>
        <div className="field"><label htmlFor="add-counterparty">Counterparty</label><input id="add-counterparty" list="cp" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Shop, person, or note" /><datalist id="cp">{suggestions.map((s) => <option key={s} value={s} />)}</datalist></div>
        <div className="field"><label htmlFor="add-when">When</label><input id="add-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
        <div className="field"><label>Category{!picked && cat ? " (from a rule)" : ""}</label><CategoryGrid categories={pickable} selected={cat} onSelect={(id) => { setCat(id); setPicked(true); }} /></div>
        <div className="field"><label htmlFor="add-reason">Reason (optional)</label><input id="add-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        {error && <div className="error">{error}</div>}
        <button className="btn">Save</button>
      </div>
    </form>
  );
}
