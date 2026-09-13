import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp } from "./setup.js";

const HTML = { accept: "text/html,application/xhtml+xml" };

function staticApp() {
  const dir = mkdtempSync(path.join(tmpdir(), "wallet-static-"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>Wallet</title>");
  writeFileSync(path.join(dir, "manifest.webmanifest"), "{}");
  mkdirSync(path.join(dir, "assets"));
  writeFileSync(path.join(dir, "assets", "x.js"), "export const x = 1;\n");
  return makeApp({ STATIC_DIR: dir });
}

describe("static PWA serving", () => {
  it("serves index.html for app routes and JSON 404 for unknown api routes", async () => {
    const app = staticApp();
    expect((await app.request("/", { headers: HTML })).status).toBe(200);
    expect(await (await app.request("/inbox/123", { headers: HTML })).text()).toContain("Wallet");
    expect((await app.request("/manifest.webmanifest")).status).toBe(200);
    const api = await app.request("/api/v2/nope", { headers: { "x-client": "web/1.0.0" } });
    expect(api.status).toBe(401);
    const unknown = await app.request("/api/nothing");
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error).toBe("not_found");
  });

  it("marks hashed assets immutable and the app shell no-cache", async () => {
    const app = staticApp();
    const asset = await app.request("/assets/x.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    for (const shellPath of ["/", "/index.html", "/manifest.webmanifest"]) {
      expect((await app.request(shellPath, { headers: HTML })).headers.get("cache-control")).toBe("no-cache");
    }
    const deepLink = await app.request("/inbox/1", { headers: HTML });
    expect(await deepLink.text()).toContain("Wallet");
    expect(deepLink.headers.get("cache-control")).toBe("no-cache");
  });

  it("404s a missing file instead of answering it with the app shell", async () => {
    const app = staticApp();
    const res = await app.request("/nope.js", { headers: { accept: "*/*" } });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("404s a non-GET request that reaches the fallback", async () => {
    const app = staticApp();
    const res = await app.request("/inbox/1", { method: "POST", headers: HTML });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });
});
