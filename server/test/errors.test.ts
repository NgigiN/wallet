import { describe, expect, it } from "vitest";
import { makeApp } from "./setup.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("onError", () => {
  it("returns 500 JSON for unhandled errors, with a request id", async () => {
    const app = makeApp();
    app.post("/boom", () => {
      throw new Error("x");
    });
    const res = await app.request("/boom", { method: "POST" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("internal");
    expect(res.headers.get("x-request-id")).toMatch(UUID);
  });

  it("stamps a distinct request id on ordinary responses too", async () => {
    const app = makeApp();
    const first = await app.request("/health");
    const second = await app.request("/health");
    expect(first.headers.get("x-request-id")).toMatch(UUID);
    expect(second.headers.get("x-request-id")).toMatch(UUID);
    expect(first.headers.get("x-request-id")).not.toBe(second.headers.get("x-request-id"));
  });
});
