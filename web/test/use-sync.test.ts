import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/sync/engine", () => ({ runSync: vi.fn(async () => ({ pushed: 0, rejected: 0, pulled: 0, cursor: 0 })) }));

// The lock lives at module scope, so each case gets a fresh module registry.
async function load() {
  const { runSync } = await import("../src/sync/engine");
  const sync = await import("../src/sync/useSync");
  // The mock instance survives resetModules; the call log must not.
  vi.mocked(runSync).mockClear();
  return { runSync: vi.mocked(runSync), useSync: sync.useSync, sync };
}
const SUMMARY = { pushed: 0, rejected: 0, pulled: 0, cursor: 0 };

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("useSync lock", () => {
  it("coalesces an overlapping trigger into exactly one extra run", async () => {
    const { runSync, useSync } = await load();
    let release!: () => void;
    runSync.mockImplementation(() => new Promise((resolve) => { release = () => resolve(SUMMARY); }));

    const { result } = renderHook(() => useSync("s1")); // mount fires the first run
    expect(runSync).toHaveBeenCalledTimes(1);

    await act(async () => { void result.current.syncNow(); }); // arrives mid-run → rerun
    expect(runSync).toHaveBeenCalledTimes(1);

    await act(async () => { release(); await Promise.resolve(); });
    expect(runSync).toHaveBeenCalledTimes(2); // the rerun, not a third pass
  });

  it("takes the lock over from a run that has hung for more than a minute", async () => {
    const { runSync, useSync } = await load();
    runSync.mockImplementation(() => new Promise(() => {})); // never settles
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useSync("s1"));
    expect(runSync).toHaveBeenCalledTimes(1);

    await act(async () => { void result.current.syncNow(); });
    expect(runSync).toHaveBeenCalledTimes(1); // still inside the watchdog window

    await act(async () => { vi.advanceTimersByTime(61_000); });
    await act(async () => { void result.current.syncNow(); });
    expect(runSync).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalled();
  });

  it("refuses to start a run after sign-out, and awaitSyncIdle waits for the one in flight", async () => {
    const { runSync, useSync, sync } = await load();
    let release!: () => void;
    runSync.mockImplementation(() => new Promise((resolve) => { release = () => resolve(SUMMARY); }));

    const { result } = renderHook(() => useSync("s1"));
    expect(runSync).toHaveBeenCalledTimes(1);

    sync.stopSync();
    let idle = false;
    const waiting = sync.awaitSyncIdle().then(() => { idle = true; });

    await act(async () => { void result.current.syncNow(); });
    expect(runSync).toHaveBeenCalledTimes(1); // nothing new starts once sign-out has begun
    expect(idle).toBe(false); // and the store must not be cleared yet

    await act(async () => { release(); await waiting; });
    expect(idle).toBe(true);
    expect(sync.isStopped()).toBe(true);
  });
});
