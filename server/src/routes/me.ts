import { Hono } from "hono";
import type { SessionVars } from "../middleware/session.js";

export function meRoutes() {
  const r = new Hono<{ Variables: SessionVars }>();
  r.get("/", (c) => c.json({ user: c.get("user") }));
  return r;
}
