import { describe, expect, it } from "vitest";
import { mergeLww, mergeTransaction, type TxIncoming, type TxRow } from "../src/services/sync-merge.js";

const t0 = new Date("2026-09-01T10:00:00Z");
const t1 = new Date("2026-09-01T11:00:00Z");
const t2 = new Date("2026-09-01T12:00:00Z");
const CAT = "11111111-1111-7111-8111-111111111111";
const CAT2 = "22222222-2222-7222-8222-222222222222";
const ctx = { spaceId: "s1", userId: "u1", categoryExists: (id: string) => id === CAT || id === CAT2 };

function incoming(over: Partial<TxIncoming> = {}): TxIncoming {
  return {
    id: "018f0000-0000-7000-8000-000000000001", source: "mpesa", receiptCode: "TID1", direction: "out",
    amountCents: 30000, costCents: 700, balanceCents: 176118, counterparty: "Margaret", occurredAt: t0,
    categoryId: null, reason: null, clientUpdatedAt: t1, deletedAt: null, ...over,
  };
}
function existing(over: Partial<TxRow> = {}): TxRow {
  return { ...incoming(), spaceId: "s1", capturedBy: "u0", linkedTransactionId: null, ...over };
}

describe("mergeTransaction", () => {
  it("inserts a new row stamped with space and captor", () => {
    const r = mergeTransaction(null, incoming({ categoryId: CAT }), ctx);
    expect(r.action).toBe("insert");
    expect(r.row).toMatchObject({ spaceId: "s1", capturedBy: "u1", categoryId: CAT });
  });
  it("rejects invalid amount and direction", () => {
    expect(mergeTransaction(null, incoming({ amountCents: 0 }), ctx)).toMatchObject({ action: "rejected", error: "invalid" });
    expect(mergeTransaction(null, incoming({ direction: "sideways" as any }), ctx)).toMatchObject({ action: "rejected", error: "invalid" });
  });
  it("rejects unknown category", () => {
    expect(mergeTransaction(null, incoming({ categoryId: "33333333-3333-7333-8333-333333333333" }), ctx)).toMatchObject({ action: "rejected", error: "bad_category" });
  });
  it("rejects edits to immutable fields on parsed rows", () => {
    const r = mergeTransaction(existing(), incoming({ amountCents: 1, clientUpdatedAt: t2 }), ctx);
    expect(r).toMatchObject({ action: "rejected", error: "immutable" });
  });
  it("allows amount/counterparty/occurredAt edits on manual rows", () => {
    const r = mergeTransaction(existing({ source: "manual", receiptCode: null }), incoming({ source: "manual", receiptCode: null, amountCents: 1234, counterparty: "Cash", clientUpdatedAt: t2 }), ctx);
    expect(r.action).toBe("update");
    expect(r.row).toMatchObject({ amountCents: 1234, counterparty: "Cash" });
  });
  it("newer tag edit wins", () => {
    const r = mergeTransaction(existing({ categoryId: CAT, clientUpdatedAt: t1 }), incoming({ categoryId: CAT2, reason: "lunch", clientUpdatedAt: t2 }), ctx);
    expect(r.action).toBe("update");
    expect(r.row).toMatchObject({ categoryId: CAT2, reason: "lunch", clientUpdatedAt: t2, capturedBy: "u0" });
  });
  it("older or equal edit is unchanged and returns the server row", () => {
    const ex = existing({ categoryId: CAT, clientUpdatedAt: t2 });
    expect(mergeTransaction(ex, incoming({ categoryId: CAT2, clientUpdatedAt: t1 }), ctx)).toEqual({ action: "unchanged", row: ex });
    expect(mergeTransaction(ex, incoming({ categoryId: CAT2, clientUpdatedAt: t2 }), ctx)).toEqual({ action: "unchanged", row: ex });
  });
  it("applies soft delete under LWW", () => {
    const r = mergeTransaction(existing({ clientUpdatedAt: t1 }), incoming({ deletedAt: t2, clientUpdatedAt: t2 }), ctx);
    expect(r.action).toBe("update");
    expect(r.row.deletedAt).toEqual(t2);
  });
  it("dedupe-as-edit: a different id for the same receipt updates the existing row and keeps its id", () => {
    const ex = existing({ id: "018f0000-0000-7000-8000-00000000000a", clientUpdatedAt: t0 });
    const r = mergeTransaction(ex, incoming({ id: "018f0000-0000-7000-8000-00000000000b", categoryId: CAT, clientUpdatedAt: t1 }), ctx);
    expect(r.action).toBe("update");
    expect(r.row.id).toBe(ex.id);
  });
});

describe("mergeLww", () => {
  const a = { id: "x", clientUpdatedAt: t1, deletedAt: null, name: "a" };
  it("inserts when missing", () => expect(mergeLww(null, a)).toEqual({ action: "insert", row: a }));
  it("updates when newer", () => expect(mergeLww(a, { ...a, name: "b", clientUpdatedAt: t2 })).toMatchObject({ action: "update", row: { name: "b" } }));
  it("unchanged when older/equal", () => expect(mergeLww(a, { ...a, name: "b", clientUpdatedAt: t1 })).toEqual({ action: "unchanged", row: a }));
});
