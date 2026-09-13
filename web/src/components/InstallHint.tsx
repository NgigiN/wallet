import { useEffect, useState } from "react";
const isStandalone = () => (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) || (navigator as any).standalone === true;
const isIosSafari = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
export function InstallHint() {
  const [prompt, setPrompt] = useState<any>(null);
  useEffect(() => { const h = (e: Event) => { e.preventDefault(); setPrompt(e); }; window.addEventListener("beforeinstallprompt", h); return () => window.removeEventListener("beforeinstallprompt", h); }, []);
  if (isStandalone()) return null;
  if (isIosSafari()) return <div className="card"><div className="title">Install Wallet</div><div className="sub">Tap Share <span aria-hidden>⎋</span>, then <b>Add to Home Screen</b>. It opens full-screen and works offline.</div></div>;
  if (prompt) return <div className="card"><div className="title">Install Wallet</div><button className="btn" onClick={() => void prompt.prompt()}>Install</button></div>;
  return null;
}
