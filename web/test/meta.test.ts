import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/schema";
import { createManualTransaction, upsertCategory } from "../src/db/repo";
import { clearAllLocalKeepingDevice, getCursor, getDeviceId, setCurrentSpaceId, setCursor } from "../src/db/meta";

const S = "s1";
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

describe("clearAllLocalKeepingDevice", () => {
  it("keeps the device id and wipes everything else", async () => {
    const deviceId = await getDeviceId();
    await setCurrentSpaceId(S);
    await setCursor(S, 42);
    await upsertCategory(S, { name: "food", kind: "expense", emoji: "🍛", color: "#B02E0C" });
    await createManualTransaction(S, { direction: "out", amount_cents: 100, counterparty: "Naivas", occurred_at: "2026-09-13T06:08:00.000Z", category_id: null, reason: null });

    await clearAllLocalKeepingDevice();

    expect(await getDeviceId()).toBe(deviceId);
    expect(await db.meta.toArray()).toEqual([{ key: "deviceId", value: deviceId }]);
    expect(await getCursor(S)).toBe(0);
    for (const table of [db.transactions, db.categories, db.budgets, db.rules]) expect(await table.count()).toBe(0);
  });

  it("mints a device id when there was none, rather than leaving the browser anonymous", async () => {
    await clearAllLocalKeepingDevice();
    expect(await getDeviceId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
