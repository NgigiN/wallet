import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "../api/auth";

export function SignIn() {
  const nav = useNavigate();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const { error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) { setError(error.message ?? "Sign in failed."); return; }
    nav("/", { replace: true });
  }
  return (
    <div className="shell-main">
      <div className="hero"><div className="dim">Welcome back</div><div className="big">Wallet</div></div>
      <form onSubmit={submit} className="card">
        <div className="field"><label>Email</label><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label>Password</label><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={busy}>Sign in</button>
        <p style={{ textAlign: "center", fontSize: 13 }}>New here? <Link to="/sign-up">Create an account</Link></p>
      </form>
    </div>
  );
}
