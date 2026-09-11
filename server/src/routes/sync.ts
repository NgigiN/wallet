import { Hono } from "hono";
import type { Db } from "../db/client.js";
import type { SpaceVars } from "../middleware/space.js";
import { PushValidationError, pullChanges, pushChanges } from "../services/sync.js";

function intParam(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

export function syncRoutes(db: Db) {
  const r = new Hono<{ Variables: SpaceVars }>();
  r.get("/", async (c) => {
    const since = Math.max(0, intParam(c.req.query("since"), 0));
    const limit = Math.min(500, Math.max(1, intParam(c.req.query("limit"), 500)));
    return c.json(await pullChanges(db, c.get("space").id, since, limit));
  });
  r.post("/", async (c) => {
    let raw: unknown;
    try { raw = await c.req.json(); } catch { return c.json({ error: "bad_request", message: "invalid JSON" }, 400); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return c.json({ error: "bad_request" }, 400);
    const space = c.get("space");
    const user = c.get("user");
    try {
      return c.json(await pushChanges(db, { spaceId: space.id, userId: user.id }, raw));
    } catch (err) {
      // `extra` carries the rest of the body the error wants (default: `{ message }`).
      if (err instanceof PushValidationError) return c.json({ error: err.code, ...err.extra }, 400);
      throw err;
    }
  });
  return r;
}
