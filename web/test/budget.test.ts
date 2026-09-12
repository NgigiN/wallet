import { describe, expect, it } from "vitest";
import { budgetLevel, budgetProgress } from "../src/logic/budget";
describe("budget", () => {
  it("levels at 80% and 100%", () => { expect(budgetLevel(79, 100)).toBe(0); expect(budgetLevel(80, 100)).toBe(1); expect(budgetLevel(100, 100)).toBe(2); expect(budgetLevel(5, 0)).toBe(0); });
  it("progress fraction clamps at 1", () => { expect(budgetProgress(150, 100)).toEqual({ fraction: 1, level: 2 }); expect(budgetProgress(25, 100).fraction).toBe(0.25); });
});
