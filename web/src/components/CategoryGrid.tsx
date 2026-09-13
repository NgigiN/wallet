import type { LocalCategory } from "../db/schema";
import { categoryStyle } from "../theme/categories";
export function CategoryGrid({ categories, selected, onSelect }: { categories: LocalCategory[]; selected: string | null; onSelect(id: string): void }) {
  return (
    <div className="grid3" role="listbox" aria-label="Category">
      {categories.map((c) => { const s = categoryStyle(c); const sel = c.id === selected;
        return <button key={c.id} type="button" role="option" aria-selected={sel} className={`chip ${sel ? "selected" : ""}`} style={{ ["--chip-color" as any]: s.color, justifyContent: "center" }} onClick={() => onSelect(c.id)}>{s.emoji} {c.name}</button>; })}
    </div>
  );
}
