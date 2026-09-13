import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { Db } from "../db/client.js";
import { member, organization } from "../db/schema.js";
import type { SessionVars } from "./session.js";

export type Space = { id: string; name: string; kind: "personal" | "shared"; role: "owner" | "member" };
export type SpaceVars = SessionVars & { space: Space };

export function spaceKind(metadata: unknown): "personal" | "shared" {
  const m = typeof metadata === "string" ? JSON.parse(metadata || "{}") : (metadata ?? {});
  return (m as any).kind === "shared" ? "shared" : "personal";
}

export function requireSpaceMember(db: Db): MiddlewareHandler<{ Variables: SpaceVars }> {
  return async (c, next) => {
    const spaceId = c.req.param("spaceId");
    if (!spaceId) return c.json({ error: "bad_request", message: "spaceId missing" }, 400);
    const [org] = await db.select().from(organization).where(eq(organization.id, spaceId)).limit(1);
    if (!org) return c.json({ error: "not_found" }, 404);
    const user = c.get("user");
    const [m] = await db.select().from(member)
      .where(and(eq(member.organizationId, spaceId), eq(member.userId, user.id))).limit(1);
    if (!m) return c.json({ error: "forbidden" }, 403);
    c.set("space", { id: org.id, name: org.name, kind: spaceKind(org.metadata), role: m.role === "owner" ? "owner" : "member" });
    await next();
  };
}
