export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return <div className="empty"><div style={{ fontSize: 40 }}>🌿</div><div style={{ fontWeight: 600 }}>{title}</div>{hint && <div style={{ fontSize: 13 }}>{hint}</div>}</div>;
}
