export function Upgrade({ min }: { min: string }) {
  return (
    <div className="shell-main"><div className="hero"><div className="dim">Update needed</div><div className="big">Wallet</div></div>
      <div className="card"><p>This version is too old (needs {min || "a newer version"}). Reload to update; if you installed Wallet on your home screen, close it fully and open it again.</p>
        <button className="btn" onClick={() => location.reload()}>Reload</button></div></div>
  );
}
