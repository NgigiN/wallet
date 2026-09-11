import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";

const env = loadEnv({
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:8080",
});

describe("GET /health", () => {
  it("returns healthy when the db check passes", async () => {
    const app = createApp({ env, healthDb: async () => true } as any);
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
    expect(body.db).toBe("ok");
    expect(typeof body.version).toBe("string");
  });

  it("returns 503 when the db check fails", async () => {
    const app = createApp({ env, healthDb: async () => false } as any);
    const res = await app.request("/health");
    expect(res.status).toBe(503);
    expect((await res.json()).db).toBe("fail");
  });
});
