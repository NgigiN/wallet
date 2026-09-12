import { useState } from "react";
import { useSpaceId } from "../hooks/useSpace";
import { useCategories } from "../hooks/useCategories";
import { archiveCategory, reorderCategories, upsertCategory } from "../db/repo";
import { requestSync } from "../sync/useSync";
import { Sheet } from "../components/Sheet";
import { SectionCard } from "../components/SectionCard";
import { categoryStyle } from "../theme/categories";
import type { LocalCategory } from "../db/schema";

const PALETTE = ["#B02E0C", "#2B6CB0", "#C43A8A", "#8B5CF6", "#AC8112", "#1B7F4B"];
type Draft = { id?: string; name: string; emoji: string; color: string; kind: "expense" | "income" | "transfer" };

/** Exactly one grapheme cluster, and that cluster is a pictographic emoji. Falls back to a code-point check where Intl.Segmenter is unavailable. */
function isSingleEmoji(s: string): boolean {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)];
    return segments.length === 1 && /^\p{Extended_Pictographic}/u.test(segments[0]!.segment);
  }
  return /^\p{Extended_Pictographic}/u.test(s) && [...s].length <= 2;
}

export function Categories() {
  const spaceId = useSpaceId(); const { list } = useCategories(spaceId);
  const [draft, setDraft] = useState<Draft | null>(null); const [error, setError] = useState<string | null>(null);
  const editing = draft?.id ? list.find((c) => c.id === draft.id) : undefined;
  function open(c?: LocalCategory) { setError(null); setDraft(c ? { id: c.id, name: c.name, emoji: c.emoji, color: c.color, kind: c.kind } : { name: "", emoji: "🧾", color: PALETTE[list.length % PALETTE.length]!, kind: "expense" }); }
  async function save() {
    if (!draft) return; const name = draft.name.trim();
    if (!name) { setError("Give it a name."); return; }
    if (list.some((c) => c.id !== draft.id && c.name.toLowerCase() === name.toLowerCase())) { setError(`You already have a category called ${name}.`); return; }
    if (!isSingleEmoji(draft.emoji)) { setError("Pick one emoji."); return; }
    await upsertCategory(spaceId!, { id: draft.id, name, emoji: draft.emoji, color: draft.color, kind: editing?.is_system ? editing.kind : draft.kind });
    requestSync(); setDraft(null);
  }
  async function move(i: number, dir: -1 | 1) { const ids = list.map((c) => c.id); const j = i + dir; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j]!, ids[i]!]; await reorderCategories(ids); requestSync(); }
  return (
    <>
      <div className="hero"><div className="dim">Settings</div><div className="big">Categories</div></div>
      <SectionCard title="Your categories" action={<button className="btn secondary" style={{ width: "auto", padding: "6px 12px" }} onClick={() => open()}>Add category</button>}>
        {list.map((c, i) => { const s = categoryStyle(c); return (
          <div key={c.id} className="row" style={{ opacity: c.archived ? 0.5 : 1 }}>
            <span style={{ fontSize: 22 }}>{s.emoji}</span>
            <button className="grow iconbtn" style={{ textAlign: "left", fontSize: 14 }} onClick={() => open(c)}><div className="title">{c.name}</div><div className="sub">{c.kind}{c.is_system ? " · built-in" : ""}{c.archived ? " · archived" : ""}</div></button>
            <button className="iconbtn" aria-label="Move up" onClick={() => void move(i, -1)}>↑</button><button className="iconbtn" aria-label="Move down" onClick={() => void move(i, 1)}>↓</button>
            <button className="iconbtn" disabled={c.is_system} title={c.is_system ? "Built-in categories can't be archived" : undefined} aria-label={c.is_system ? "Built-in categories can't be archived" : c.archived ? "Unarchive" : "Archive"} onClick={() => { if (c.is_system) return; void archiveCategory(c.id, !c.archived); requestSync(); }}>{c.archived ? "♻️" : "🗄"}</button>
          </div>); })}
      </SectionCard>
      <Sheet open={draft !== null} onClose={() => setDraft(null)}>
        {draft && <>
          <h3>{draft.id ? "Edit category" : "New category"}</h3>
          <div className="field"><label htmlFor="cat-name">Name</label><input id="cat-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="cat-emoji">Emoji</label><input id="cat-emoji" value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} /></div>
          <div className="field"><label htmlFor="cat-color">Colour</label><input id="cat-color" type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></div>
          <div className="field"><label htmlFor="cat-kind">Kind</label><select id="cat-kind" value={draft.kind} disabled={!!editing?.is_system} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })}><option value="expense">Expense</option><option value="income">Income</option>{draft.kind === "transfer" && <option value="transfer">Transfer</option>}</select>{editing?.is_system && <div className="sub">Built-in categories keep their kind.</div>}</div>
          {error && <div className="error">{error}</div>}
          <button className="btn" onClick={() => void save()}>Save</button>
        </>}
      </Sheet>
    </>
  );
}
