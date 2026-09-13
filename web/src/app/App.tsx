import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router";
import { onUnauthorized, onUpgradeRequired } from "../api/client";
import { signOutEverywhere } from "../api/auth";
import { MaskProvider } from "../hooks/useMask";
import { AppRoutes } from "./routes";
import { Upgrade } from "../screens/Upgrade";

export function App() {
  const [upgradeMin, setUpgradeMin] = useState<string | null>(null);
  useEffect(() => {
    onUpgradeRequired((min) => setUpgradeMin(min));
    // A 401 means this browser's session is gone: leave exactly the state the sign-out
    // button leaves, or the next sign-in inherits the previous account's rows.
    onUnauthorized(() => { void signOutEverywhere(); });
  }, []);
  if (upgradeMin !== null) return <Upgrade min={upgradeMin} />;
  return <BrowserRouter><MaskProvider><AppRoutes /></MaskProvider></BrowserRouter>;
}
