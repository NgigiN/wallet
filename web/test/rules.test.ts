import { describe, expect, it } from "vitest";
import { matchRule } from "../src/logic/rules";
const r = (m: string, c: string, deleted = false) => ({ id: m, match_counterparty: m, category_id: c, deleted_at: deleted ? "x" : null } as any);
describe("matchRule", () => {
  it("matches normalised counterparty against live rules only", () => {
    expect(matchRule([r("naivas supermarket", "food")], "  Naivas   SUPERMARKET ")).toBe("food");
    expect(matchRule([r("naivas", "food", true)], "naivas")).toBeNull();
    expect(matchRule([], "x")).toBeNull();
  });
});
