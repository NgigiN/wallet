import { describe, expect, it } from "vitest";
import { makeApp } from "./setup.js";
import { authed, signUp } from "./helpers.js";

describe("devices", () => {
  it("registers, updates, and lists devices for the caller only", async () => {
    const app = makeApp();
    const a = await signUp(app, "a@example.com");
    const b = await signUp(app, "b@example.com");
    const id = "77777777-7777-7777-8777-777777777777";
    const reg = await app.request("/api/v2/me/devices", authed(a.token, { method: "POST", body: JSON.stringify({ id, platform: "android", name: "CPH2799", app_version: "1.2.0" }) }));
    expect(reg.status).toBe(200);
    const upd = await app.request("/api/v2/me/devices", authed(a.token, { method: "POST", body: JSON.stringify({ id, platform: "android", name: "CPH2799", app_version: "1.3.0", push_token: "tok" }) }));
    expect((await upd.json()).device).toMatchObject({ app_version: "1.3.0", has_push_token: true });
    const list = await (await app.request("/api/v2/me/devices", authed(a.token))).json();
    expect(list.devices).toHaveLength(1);
    const steal = await app.request("/api/v2/me/devices", authed(b.token, { method: "POST", body: JSON.stringify({ id, platform: "web", name: "x", app_version: "1.0.0" }) }));
    expect(steal.status).toBe(409);
    expect((await (await app.request("/api/v2/me/devices", authed(b.token))).json()).devices).toHaveLength(0);
  });
});
