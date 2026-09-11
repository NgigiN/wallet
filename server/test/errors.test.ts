import { describe, expect, it } from "vitest";
import { makeApp } from "./setup.js";

describe("onError", () => {
  it("returns 500 JSON for unhandled errors", async () => {
    const app = makeApp();
    app.post("/boom", () => {
      throw new Error("x");
    });
    const res = await app.request("/boom", { method: "POST" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("internal");
  });
});
