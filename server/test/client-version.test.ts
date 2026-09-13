import { describe, expect, it } from "vitest";
import { compareSemver, parseClientHeader } from "../src/services/version.js";
import { makeApp } from "./setup.js";
import { signUp } from "./helpers.js";

describe("compareSemver", () => {
  it("orders numerically per segment", () => {
    expect(compareSemver("1.2.0", "1.10.0")).toBe(-1);
    expect(compareSemver("2.0.0", "1.99.99")).toBe(1);
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
    expect(compareSemver("1.2", "1.2.0")).toBe(0);
  });
});

describe("parseClientHeader", () => {
  it("accepts platform/semver", () => {
    expect(parseClientHeader("android/1.2.3")).toEqual({ platform: "android", version: "1.2.3" });
    expect(parseClientHeader("web/0.1.0")).toEqual({ platform: "web", version: "0.1.0" });
    expect(parseClientHeader("ios/1.0.0")).toBeNull();
    expect(parseClientHeader("android")).toBeNull();
    expect(parseClientHeader(undefined)).toBeNull();
  });
});

describe("client version gate", () => {
  it("400s without the header and 426s below the minimum", async () => {
    const app = makeApp({ MIN_CLIENT_WEB: "1.0.0", MIN_CLIENT_ANDROID: "1.0.0" });
    const { token } = await signUp(app, "v@example.com");
    const noHeader = await app.request("/api/v2/me", { headers: { authorization: `Bearer ${token}` } });
    expect(noHeader.status).toBe(400);
    expect((await noHeader.json()).error).toBe("client_header_required");

    const old = await app.request("/api/v2/me", { headers: { authorization: `Bearer ${token}`, "x-client": "web/0.9.9" } });
    expect(old.status).toBe(426);
    expect(await old.json()).toEqual({ error: "upgrade_required", min: "1.0.0", platform: "web" });

    const ok = await app.request("/api/v2/me", { headers: { authorization: `Bearer ${token}`, "x-client": "web/1.0.0" } });
    expect(ok.status).toBe(200);
  });
});
