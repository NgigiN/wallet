import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/auth.js";
import { makeApp, testDb, testEnv } from "./setup.js";

describe("GET /health", () => {
  it("returns healthy when the db check passes", async () => {
    const app = makeApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
    expect(body.db).toBe("ok");
    expect(typeof body.version).toBe("string");
  });

  it("returns 503 when the db check fails", async () => {
    const auth = createAuth(testDb, testEnv);
    const app = createApp({ env: testEnv, db: testDb, auth, healthDb: async () => false });
    const res = await app.request("/health");
    expect(res.status).toBe(503);
    expect((await res.json()).db).toBe("fail");
  });
});
