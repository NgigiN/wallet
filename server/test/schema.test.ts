import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { testDb } from "./setup.js";

describe("schema", () => {
  it("has the application tables and the change sequence", async () => {
    const { rows } = await testDb.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name`);
    const names = rows.map((r: any) => r.table_name);
    for (const t of ["space_settings", "categories", "transactions", "budgets", "budget_alerts", "rules", "devices"]) {
      expect(names).toContain(t);
    }
    const seq = await testDb.execute(sql`select nextval('change_seq') as v`);
    expect(Number((seq.rows[0] as any).v)).toBeGreaterThan(0);
  });

  it("enforces the transaction dedupe key including direction", async () => {
    await testDb.execute(sql`insert into organization (id, name, slug, created_at) values ('s1','S','s1', now())`);
    await testDb.execute(sql`insert into transactions (id, space_id, source, receipt_code, direction, amount_cents, counterparty, occurred_at, client_updated_at)
      values ('018f0000-0000-7000-8000-000000000001','s1','mpesa','TID1','out',1000,'X',now(),now())`);
    await testDb.execute(sql`insert into transactions (id, space_id, source, receipt_code, direction, amount_cents, counterparty, occurred_at, client_updated_at)
      values ('018f0000-0000-7000-8000-000000000002','s1','mpesa','TID1','in',1000,'X',now(),now())`);
    // drizzle-orm 0.45.2 wraps the pg driver error in a DrizzleQueryError whose top-level
    // `message` is just "Failed query: ..."; the actual "duplicate key value violates unique
    // constraint" text lives on `.cause`. Assert against the wrapped cause instead of the
    // brief's `.rejects.toThrow(/unique/i)`, which only inspects the top-level message.
    await expect(testDb.execute(sql`insert into transactions (id, space_id, source, receipt_code, direction, amount_cents, counterparty, occurred_at, client_updated_at)
      values ('018f0000-0000-7000-8000-000000000003','s1','mpesa','TID1','out',1000,'X',now(),now())`)).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/unique/i) },
    });
  });

  it("rejects a transaction whose amount is not positive", async () => {
    await testDb.execute(sql`insert into organization (id, name, slug, created_at) values ('s1','S','s1', now())`);
    await expect(testDb.execute(sql`insert into transactions (id, space_id, source, receipt_code, direction, amount_cents, counterparty, occurred_at, client_updated_at)
      values ('018f0000-0000-7000-8000-00000000000a','s1','manual',null,'out',0,'X',now(),now())`)).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/check constraint/i) },
    });
  });
});
