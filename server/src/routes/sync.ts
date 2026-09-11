import { Hono } from "hono";
import type { Db } from "../db/client.js";
import type { SpaceVars } from "../middleware/space.js";
import { pullChanges } from "../services/sync.js";

export function syncRoutes(db: Db) {
  const r = new Hono<{ Variables: SpaceVars }>();
  r.get("/", async (c) => {
    const since = Math.max(0, parseInt(c.req.query("since") ?? "0", 10) || 0);
    const limit = Math.min(500, Math.max(1, parseInt(c.req.query("limit") ?? "500", 10) || 500));
    return c.json(await pullChanges(db, c.get("space").id, since, limit));
  });
  return r;
}
