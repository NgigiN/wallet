import type { ReactNode } from "react";
export function Sheet({ open, onClose, children }: { open: boolean; onClose(): void; children: ReactNode }) {
  if (!open) return null;
  return <div className="sheet-backdrop" onClick={onClose}><div className="sheet" role="dialog" onClick={(e) => e.stopPropagation()}>{children}</div></div>;
}
