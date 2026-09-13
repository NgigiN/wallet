import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { devices } from "../db/schema.js";
import type { SessionVars } from "../middleware/session.js";

const deviceIn = z.object({
  id: z.string().uuid(), platform: z.enum(["android", "web"]), name: z.string().trim().min(1).max(80),
  app_version: z.string().regex(/^\d+\.\d+(\.\d+)?$/), push_token: z.string().min(1).nullable().optional(),
});

const toWire = (d: typeof devices.$inferSelect) => ({
  id: d.id, platform: d.platform, name: d.name, app_version: d.appVersion, last_seen_at: d.lastSeenAt.toISOString(), has_push_token: d.pushToken != null,
});

export function meRoutes(db: Db) {
  const r = new Hono<{ Variables: SessionVars }>();
  r.get("/", (c) => c.json({ user: c.get("user") }));

  r.get("/devices", async (c) => {
    const rows = await db.select().from(devices).where(eq(devices.userId, c.get("user").id));
    return c.json({ devices: rows.map(toWire) });
  });

  r.post("/devices", async (c) => {
    const p = deviceIn.safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: "invalid", message: p.error.issues[0]?.message }, 400);
    const user = c.get("user");
    const w = p.data;
    const [existing] = await db.select().from(devices).where(eq(devices.id, w.id)).limit(1);
    if (existing && existing.userId !== user.id) return c.json({ error: "conflict" }, 409);
    const values = { id: w.id, userId: user.id, platform: w.platform, name: w.name, appVersion: w.app_version, lastSeenAt: new Date(), ...(w.push_token !== undefined ? { pushToken: w.push_token } : {}) };
    const [row] = existing
      ? await db.update(devices).set(values).where(and(eq(devices.id, w.id), eq(devices.userId, user.id))).returning()
      : await db.insert(devices).values(values).returning();
    return c.json({ device: toWire(row) });
  });
  return r;
}
