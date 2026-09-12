import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "../api/auth";

export function SignUp() {
  const nav = useNavigate();
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) { setError("Use at least 10 characters."); return; }
    setBusy(true); setError(null);
    const { error } = await authClient.signUp.email({ name, email, password });
    setBusy(false);
    if (error) { setError(error.message ?? "Sign up failed."); return; }
    nav("/", { replace: true });
  }
  return (
    <div className="shell-main">
      <div className="hero"><div className="dim">Let's get you set up</div><div className="big">Create account</div></div>
      <form onSubmit={submit} className="card">
        <div className="field"><label>Name</label><input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="field"><label>Email</label><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label>Password (10+ characters)</label><input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} /></div>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={busy}>Create account</button>
        <p style={{ textAlign: "center", fontSize: 13 }}>Already have one? <Link to="/sign-in">Sign in</Link></p>
      </form>
    </div>
  );
}
