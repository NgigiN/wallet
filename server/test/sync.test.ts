import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { categories } from "../src/db/schema.js";
import { makeApp, testDb } from "./setup.js";
import { authed, signUp } from "./helpers.js";

async function setup(email = "s@example.com") {
  const app = makeApp();
  const { token, userId } = await signUp(app, email);
  const { spaces } = await (await app.request("/api/v2/spaces", authed(token))).json();
  const spaceId = spaces[0].id as string;
  const cats = await testDb.select().from(categories).where(eq(categories.spaceId, spaceId));
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  return { app, token, userId, spaceId, cat };
}

describe("sync pull", () => {
  it("returns the seeded categories from cursor 0 with a cursor and more=false", async () => {
    const { app, token, spaceId } = await setup();
    const res = await app.request(`/api/v2/spaces/${spaceId}/sync?since=0`, authed(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.categories).toHaveLength(7);
    expect(body.transactions).toEqual([]);
    expect(body.more).toBe(false);
    expect(body.cursor).toBe(Math.max(...body.categories.map((c: any) => c.seq)));
    expect(body.categories[0]).toMatchObject({ name: expect.any(String), kind: expect.any(String), is_system: expect.any(Boolean), deleted_at: null });
  });

  it("returns nothing past the cursor", async () => {
    const { app, token, spaceId } = await setup();
    const first = await (await app.request(`/api/v2/spaces/${spaceId}/sync?since=0`, authed(token))).json();
    const second = await (await app.request(`/api/v2/spaces/${spaceId}/sync?since=${first.cursor}`, authed(token))).json();
    expect(second.categories).toEqual([]);
    expect(second.cursor).toBe(first.cursor);
  });

  it("pages with limit and more=true", async () => {
    const { app, token, spaceId } = await setup();
    const page = await (await app.request(`/api/v2/spaces/${spaceId}/sync?since=0&limit=3`, authed(token))).json();
    expect(page.categories).toHaveLength(3);
    expect(page.more).toBe(true);
    const rest = await (await app.request(`/api/v2/spaces/${spaceId}/sync?since=${page.cursor}&limit=10`, authed(token))).json();
    expect(rest.categories).toHaveLength(4);
    expect(rest.more).toBe(false);
  });

  it("clamps limit=0 to 1 rather than falling back to the default", async () => {
    const { app, token, spaceId } = await setup();
    const res = await app.request(`/api/v2/spaces/${spaceId}/sync?since=0&limit=0`, authed(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.categories).toHaveLength(1);
    expect(body.more).toBe(true);
  });

  it("treats a negative since as 0", async () => {
    const { app, token, spaceId } = await setup();
    const res = await app.request(`/api/v2/spaces/${spaceId}/sync?since=-5`, authed(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.categories).toHaveLength(7);
  });
});
