import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Mask = { hidden: boolean; toggle(): void };
const Ctx = createContext<Mask>({ hidden: true, toggle() {} });

/** Header amounts start hidden on every load; the choice is deliberately not persisted. */
export function MaskProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(true);
  const value = useMemo(() => ({ hidden, toggle: () => setHidden((h) => !h) }), [hidden]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useMask = () => useContext(Ctx);
