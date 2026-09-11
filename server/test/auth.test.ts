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
