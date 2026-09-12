import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router";
import { onUnauthorized, onUpgradeRequired } from "../api/client";
import { authClient } from "../api/auth";
import { MaskProvider } from "../hooks/useMask";
import { AppRoutes } from "./routes";
import { Upgrade } from "../screens/Upgrade";

export function App() {
  const [upgradeMin, setUpgradeMin] = useState<string | null>(null);
  useEffect(() => {
    onUpgradeRequired((min) => setUpgradeMin(min));
    onUnauthorized(() => { void authClient.signOut(); });
  }, []);
  if (upgradeMin !== null) return <Upgrade min={upgradeMin} />;
  return <BrowserRouter><MaskProvider><AppRoutes /></MaskProvider></BrowserRouter>;
}
