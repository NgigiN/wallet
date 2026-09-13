import { describe, expect, it } from "vitest";
import { makeApp } from "./setup.js";
import { authed, signUp } from "./helpers.js";

describe("auth", () => {
  it("signs up and returns a bearer token usable on /api/v2/me", async () => {
    const app = makeApp();
    const { token, userId } = await signUp(app, "a@example.com");
    const res = await app.request("/api/v2/me", authed(token));
    expect(res.status).toBe(200);
    expect((await res.json()).user.id).toBe(userId);
  });

  it("rejects /api/v2/me without a session", async () => {
    const app = makeApp();
    const res = await app.request("/api/v2/me", { headers: { "x-client": "web/0.1.0" } });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
  });

  it("rejects passwords shorter than 10 characters", async () => {
    const app = makeApp();
    await expect(signUp(app, "b@example.com", "short")).rejects.toThrow(/sign-up failed: 400/);
  });
});

describe("session checks", () => {
  it("does not rate limit GET /api/auth/get-session (the app polls it)", async () => {
    const app = makeApp();
    const { token } = await signUp(app, "poller@example.com");
    for (let i = 0; i < 11; i++) {
      const res = await app.request("/api/auth/get-session", { headers: { authorization: `Bearer ${token}`, "x-real-ip": "203.0.113.9" } });
      expect(res.status).toBe(200);
    }
  });

  it("still rate limits sign-in attempts from one address", async () => {
    const app = makeApp();
    const attempt = () => app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:8080", "x-real-ip": "203.0.113.10" },
      body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password-here" }),
    });
    let limited = false;
    for (let i = 0; i < 12; i++) if ((await attempt()).status === 429) { limited = true; break; }
    expect(limited).toBe(true);
  });
});
