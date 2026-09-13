import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { categories, transactions } from "../src/db/schema.js";
import { importRows, importTxId, type ExportRow } from "../src/scripts/import-json.js";
import { makeApp, testDb } from "./setup.js";
import { signUp } from "./helpers.js";

const rows = JSON.parse(readFileSync(new URL("./fixtures/export-sample.json", import.meta.url), "utf8")) as ExportRow[];

describe("import-json", () => {
  it("refuses an unknown email", async () => {
    await expect(importRows(testDb, "nobody@example.com", rows)).rejects.toThrow(/sign up first/);
  });

  it("imports the fixture into the user's personal space with exact counts and sums, mapping legacy blanks", async () => {
    await signUp(makeApp(), "owner@example.com");
    const s = await importRows(testDb, "owner@example.com", rows);
    expect(s).toMatchObject({ read: 6, inserted: 6, updated: 0, categoriesCreated: ["rent"] });
    // parity with the SQLite-side sums: out = 300 + 150.5 + 99.99 + 1200 ; in = 2000
    expect(s.sumOutCents).toBe(30000 + 15050 + 9999 + 120000); expect(s.sumInCents).toBe(200000);
    const tx = await testDb.select().from(transactions).where(eq(transactions.spaceId, s.spaceId));
    expect(tx).toHaveLength(6);
    const byReceipt = new Map(tx.map((t) => [t.receiptCode, t]));
    expect(byReceipt.get("TIDA2")).toMatchObject({ direction: "out", source: "mpesa", amountCents: 15050, capturedBy: s.userId }); // blanks defaulted
    expect(byReceipt.get("TIDA5")).toMatchObject({ categoryId: null, balanceCents: null, costCents: 100, source: "airtel" });     // uncategorized → null
    expect(byReceipt.get("TIDA1")!.occurredAt.toISOString()).toBe("2026-09-01T06:24:00.000Z");                                      // EAT → instant
    expect(byReceipt.get("TIDA1")!.clientUpdatedAt.toISOString()).toBe("2026-09-01T06:25:00.000Z");                                 // from updated_at
    const cats = await testDb.select().from(categories).where(eq(categories.spaceId, s.spaceId));
    const name = (id: string | null) => cats.find((c) => c.id === id)?.name;
    expect(name(byReceipt.get("TIDA3")!.categoryId)).toBe("income"); expect(name(byReceipt.get("TIDA4")!.categoryId)).toBe("transfer"); expect(name(byReceipt.get("TIDA6")!.categoryId)).toBe("rent");
    expect(byReceipt.get("TIDA1")!.id).toBe(importTxId(s.spaceId, "TIDA1", "out"));
  });

  it("is idempotent: a re-run updates in place and creates nothing new", async () => {
    await signUp(makeApp(), "owner@example.com");
    const first = await importRows(testDb, "owner@example.com", rows);
    const again = await importRows(testDb, "owner@example.com", [...rows, { ...rows[0]!, reason: "edited" }]);
    expect(again).toMatchObject({ read: 7, inserted: 0, updated: 7, categoriesCreated: [] });
    const tx = await testDb.select().from(transactions).where(eq(transactions.spaceId, first.spaceId));
    expect(tx).toHaveLength(6);
    expect(tx.find((t) => t.receiptCode === "TIDA1")!.reason).toBe("edited");
    expect(Math.min(...tx.map((t) => t.seq))).toBeGreaterThan(Math.max(...(await testDb.select({ seq: categories.seq }).from(categories).where(eq(categories.spaceId, first.spaceId))).map((c) => c.seq)));
  });
});
