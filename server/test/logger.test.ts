import { describe, expect, it } from "vitest";
import { errSerializer } from "../src/logger.js";

describe("errSerializer", () => {
  it("scrubs SQL and bound params from a DrizzleQueryError-shaped error, keeping the constraint name and stack frames", () => {
    const message =
      "Failed query: insert into budgets (id, space_id, category_id, monthly_limit_cents) values ($1, $2, $3, $4)\n" +
      "params: 018f0000-0000-7000-8000-000000000001,JOHN DOE 0712345678,250000";
    const stack =
      message +
      "\n    at Object.<anonymous> (/app/src/db/client.ts:42:10)" +
      "\n    at processTicksAndRejections (node:internal/process/task_queues:95:5)";
    const err = {
      name: "DrizzleQueryError",
      message,
      stack,
      query: "insert into budgets (id, space_id, category_id, monthly_limit_cents) values ($1, $2, $3, $4)",
      params: ["018f0000-0000-7000-8000-000000000001", "JOHN DOE 0712345678", 250000],
      cause: new Error('duplicate key value violates unique constraint "budgets_space_category_uq"'),
    };

    const result = errSerializer(err as unknown as Error);
    const json = JSON.stringify(result);

    expect(json).not.toContain("JOHN DOE");
    expect(json).not.toContain("250000");
    expect(json).not.toContain("insert into");
    expect(json).toContain("budgets_space_category_uq");
    expect(result.stack).toContain("    at ");
  });

  it("passes a plain error through unscrubbed", () => {
    const err = new Error("boom");
    const originalStack = err.stack;

    const result = errSerializer(err);

    expect(result.message).toBe("boom");
    expect(result.stack).toBe(originalStack);
  });
});
