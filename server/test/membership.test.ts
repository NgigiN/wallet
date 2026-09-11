import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { member, organization } from "../src/db/schema.js";
import { makeApp, testDb } from "./setup.js";
import { authed, signUp } from "./helpers.js";

describe("spaces and membership", () => {
  it("lists the caller's personal space", async () => {
    const app = makeApp();
    const { token } = await signUp(app, "a@example.com");
    const res = await app.request("/api/v2/spaces", authed(token));
    expect(res.status).toBe(200);
    const { spaces } = await res.json();
    expect(spaces).toHaveLength(1);
    expect(spaces[0]).toMatchObject({ name: "Personal", kind: "personal", role: "owner" });
  });

  it("returns 403 for a space the caller is not a member of", async () => {
    const app = makeApp();
    const a = await signUp(app, "a@example.com");
    const b = await signUp(app, "b@example.com");
    const { spaces } = await (await app.request("/api/v2/spaces", authed(a.token))).json();
    const res = await app.request(`/api/v2/spaces/${spaces[0].id}/ping`, authed(b.token));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
  });

  it("returns 404 for an unknown space id", async () => {
    const app = makeApp();
    const a = await signUp(app, "a@example.com");
    const res = await app.request(`/api/v2/spaces/does-not-exist/ping`, authed(a.token));
    expect(res.status).toBe(404);
  });

  it("attaches the space and role for a member", async () => {
    const app = makeApp();
    const a = await signUp(app, "a@example.com");
    const { spaces } = await (await app.request("/api/v2/spaces", authed(a.token))).json();
    const res = await app.request(`/api/v2/spaces/${spaces[0].id}/ping`, authed(a.token));
    expect(res.status).toBe(200);
    expect((await res.json()).space).toMatchObject({ id: spaces[0].id, role: "owner", kind: "personal" });
  });

  it("self-heals a missing personal space by re-creating it on list", async () => {
    const app = makeApp();
    const { userId, token } = await signUp(app, "healme@example.com");

    const [membership] = await testDb.select().from(member).where(eq(member.userId, userId));
    const spaceId = membership.organizationId;

    await testDb.delete(member).where(eq(member.userId, userId));
    await testDb.delete(organization).where(eq(organization.id, spaceId));

    const res = await app.request("/api/v2/spaces", authed(token));
    expect(res.status).toBe(200);
    const { spaces } = await res.json();
    expect(spaces).toHaveLength(1);
    expect(spaces[0]).toMatchObject({ name: "Personal", kind: "personal", role: "owner" });
  });
});
