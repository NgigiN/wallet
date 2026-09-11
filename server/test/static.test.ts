import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp } from "./setup.js";

describe("static PWA serving", () => {
  it("serves index.html for app routes and JSON 404 for unknown api routes", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wallet-static-"));
    writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>Wallet</title>");
    writeFileSync(path.join(dir, "manifest.webmanifest"), "{}");
    const app = makeApp({ STATIC_DIR: dir });
    expect((await app.request("/")).status).toBe(200);
    expect(await (await app.request("/inbox/123")).text()).toContain("Wallet");
    expect((await app.request("/manifest.webmanifest")).status).toBe(200);
    const api = await app.request("/api/v2/nope", { headers: { "x-client": "web/1.0.0" } });
    expect(api.status).toBe(401);
    const unknown = await app.request("/api/nothing");
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error).toBe("not_found");
  });
});
