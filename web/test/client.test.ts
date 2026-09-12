import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError, onUpgradeRequired, onUnauthorized } from "../src/api/client";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("apiFetch", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sends X-Client and parses JSON", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => json(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await apiFetch<{ ok: boolean }>("/api/v2/me");
    expect(out.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v2/me");
    expect(new Headers(init!.headers).get("x-client")).toBe("web/0.1.0-test");
    expect(init!.credentials).toBe("include");
  });
  it("throws ApiError with the server code and calls the 426 hook", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(426, { error: "upgrade_required", min: "1.0.0", platform: "web" })));
    const hook = vi.fn(); onUpgradeRequired(hook);
    await expect(apiFetch("/api/v2/me")).rejects.toMatchObject({ status: 426, code: "upgrade_required", extra: { min: "1.0.0" } });
    expect(hook).toHaveBeenCalledWith("1.0.0");
  });
  it("calls the 401 hook", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { error: "unauthorized" })));
    const hook = vi.fn(); onUnauthorized(hook);
    await expect(apiFetch("/api/v2/me")).rejects.toBeInstanceOf(ApiError);
    expect(hook).toHaveBeenCalled();
  });
  it("wraps network failures as ApiError status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(apiFetch("/api/v2/me")).rejects.toMatchObject({ status: 0, code: "network" });
  });
});
