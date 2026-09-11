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

  it("covers device push_token omit/null semantics and response shape", async () => {
    const app = makeApp();
    const a = await signUp(app, "a@example.com");
    const id = "88888888-8888-8888-8888-888888888888";

    // 1. Register without push_token
    const step1 = await app.request("/api/v2/me/devices", authed(a.token, { method: "POST", body: JSON.stringify({ id, platform: "android", name: "CPH2799", app_version: "1.2.0" }) }));
    const dev1 = (await step1.json()).device;
    expect(dev1).toMatchObject({ id, platform: "android", name: "CPH2799", app_version: "1.2.0", last_seen_at: expect.any(String), has_push_token: false });
    const ts1 = dev1.last_seen_at;

    // 2. Add push_token
    const step2 = await app.request("/api/v2/me/devices", authed(a.token, { method: "POST", body: JSON.stringify({ id, platform: "android", name: "CPH2799", app_version: "1.2.0", push_token: "tok-1" }) }));
    const dev2 = (await step2.json()).device;
    expect(dev2).toMatchObject({ has_push_token: true });

    // 3. Omit push_token (should remain true)
    const step3 = await app.request("/api/v2/me/devices", authed(a.token, { method: "POST", body: JSON.stringify({ id, platform: "android", name: "CPH2799", app_version: "1.2.0" }) }));
    const dev3 = (await step3.json()).device;
    expect(dev3).toMatchObject({ has_push_token: true });

    // 4. Explicitly set push_token to null (should clear it)
    const step4 = await app.request("/api/v2/me/devices", authed(a.token, { method: "POST", body: JSON.stringify({ id, platform: "android", name: "CPH2799", app_version: "1.2.0", push_token: null }) }));
    const dev4 = (await step4.json()).device;
    expect(dev4).toMatchObject({ has_push_token: false });
    const ts4 = dev4.last_seen_at;

    // 5. Verify timestamps: ts4 should be >= ts1
    expect(Date.parse(ts4)).toBeGreaterThanOrEqual(Date.parse(ts1));
  });
});
