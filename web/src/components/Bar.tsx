export function Bar({ fraction, color, emoji, label, value, sub }: { fraction: number; color: string; emoji: string; label: string; value: string; sub?: string }) {
  return (
    <div className="barrow" title={`${label}: ${value}${sub ? ` (${sub})` : ""}`}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div><div className="label">{label}</div><div className="track"><div className="fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`, ["--bar-color" as any]: color }} /></div>{sub && <div className="sub">{sub}</div>}</div>
      <div className="label">{value}</div>
    </div>
  );
}
