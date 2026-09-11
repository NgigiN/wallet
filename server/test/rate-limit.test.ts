import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { clientIp, rateLimit } from "../src/middleware/rate-limit.js";

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

  it("ignores a spoofed cf-connecting-ip when nginx supplied x-real-ip", async () => {
    const app = new Hono();
    app.use("*", rateLimit({ windowMs: 60_000, max: 1, keyFn: clientIp, now: () => 1_000_000 }));
    app.get("/", (c) => c.text("ok"));
    const hit = (spoof: string) => app.request("/", { headers: { "x-real-ip": "10.0.0.1", "cf-connecting-ip": spoof, "x-forwarded-for": spoof } });
    expect((await hit("1.1.1.1")).status).toBe(200);
    expect((await hit("2.2.2.2")).status).toBe(429);
  });
});
