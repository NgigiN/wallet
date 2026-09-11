import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { rateLimit } from "../src/middleware/rate-limit.js";

describe("rateLimit", () => {
  it("allows max requests per window then 429s, per key", async () => {
    let now = 1_000_000;
    const app = new Hono();
    app.use("*", rateLimit({ windowMs: 60_000, max: 2, keyFn: (c) => c.req.header("x-k") ?? "anon", now: () => now }));
    app.get("/", (c) => c.text("ok"));
    const hit = (k: string) => app.request("/", { headers: { "x-k": k } });
    expect((await hit("a")).status).toBe(200);
    expect((await hit("a")).status).toBe(200);
    expect((await hit("a")).status).toBe(429);
    expect((await hit("b")).status).toBe(200);
    now += 60_001;
    expect((await hit("a")).status).toBe(200);
  });
});
