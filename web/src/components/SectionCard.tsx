import type { ReactNode } from "react";
export function SectionCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3>{title}</h3>{action}</div>{children}</section>;
}
