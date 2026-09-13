import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/schema";
import { createManualTransaction } from "../src/db/repo";
import { useSpaceData } from "../src/hooks/useSpaceData";

const S = "s1";
const add = (counterparty: string, occurredAt: string) =>
  createManualTransaction(S, { direction: "out", amount_cents: 100, counterparty, occurred_at: occurredAt, category_id: null, reason: null });

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await add("old", "2024-01-05T09:00:00.000Z");
  await add("inside", "2026-09-10T09:00:00.000Z");
  await add("boundary", "2026-10-01T00:00:00.000Z"); // the window's exclusive upper bound
  await add("future", "2026-11-02T09:00:00.000Z");
  await createManualTransaction("other-space", { direction: "out", amount_cents: 100, counterparty: "elsewhere", occurred_at: "2026-09-11T09:00:00.000Z", category_id: null, reason: null });
});

describe("useSpaceData", () => {
  it("returns only the rows inside the window", async () => {
    const { result } = renderHook(() => useSpaceData(S, { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }));
    await waitFor(() => expect(result.current.rows.map((r) => r.counterparty)).toEqual(["inside"]));
  });

  it("still reports the oldest row in the space, which the window excludes", async () => {
    const { result } = renderHook(() => useSpaceData(S, { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }));
    await waitFor(() => expect(result.current.earliest.toISOString()).toBe("2024-01-05T09:00:00.000Z"));
  });

  it("returns the whole space, and nothing from another space, with no window", async () => {
    const { result } = renderHook(() => useSpaceData(S));
    await waitFor(() => expect(result.current.rows.map((r) => r.counterparty)).toEqual(["old", "inside", "boundary", "future"]));
  });
});
