import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Auth } from "../auth.js";
import type { Db } from "../db/client.js";
import { member, organization } from "../db/schema.js";
import { requireSpaceMember, spaceKind, type SpaceVars } from "../middleware/space.js";
import { syncRoutes } from "./sync.js";

async function loadMemberships(db: Db, userId: string) {
  return db.select({ org: organization, role: member.role }).from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId));
}

export function spaceRoutes(db: Db, auth: Auth) {
  const r = new Hono<{ Variables: SpaceVars }>();

  r.get("/", async (c) => {
    const user = c.get("user");
    let rows = await loadMemberships(db, user.id);

    if (rows.length === 0) {
      // Self-heal: the personal-space sign-up hook may have thrown, leaving a user
      // with no space and nothing to retry it. Recreate it here and re-query rather
      // than trusting createOrganization's return, to guard against a concurrent
      // request already having created it.
      await auth.api.createOrganization({
        body: {
          name: "Personal",
          slug: `personal-${user.id.toLowerCase()}`,
          userId: user.id,
          metadata: { kind: "personal" },
        },
      });
      rows = await loadMemberships(db, user.id);
    }

    return c.json({
      spaces: rows.map(({ org, role }) => ({ id: org.id, name: org.name, kind: spaceKind(org.metadata), role: role === "owner" ? "owner" : "member" })),
    });
  });

  r.use("/:spaceId/*", requireSpaceMember(db));
  r.get("/:spaceId/ping", (c) => c.json({ space: c.get("space") }));
  r.route("/:spaceId/sync", syncRoutes(db));
  return r;
}
