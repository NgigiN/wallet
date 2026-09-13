import { describe, expect, it } from "vitest";
import { range, step, label, periodsInRange, isoWeek } from "../src/logic/period";

const d = (s: string) => new Date(s + "T12:00:00");
describe("period", () => {
  it("week range is Monday..next Monday exclusive", () => {
    const { from, to } = range("week", d("2026-09-10")); // Thursday
    expect(new Date(from).getDay()).toBe(1); expect(new Date(from).getDate()).toBe(7);
    expect(new Date(to).getDate()).toBe(14); expect(new Date(to).getHours()).toBe(0);
  });
  it("month and year ranges", () => {
    const m = range("month", d("2026-02-10")); expect(new Date(m.from).getDate()).toBe(1); expect(new Date(m.to).getMonth()).toBe(2);
    const y = range("year", d("2026-06-01")); expect(new Date(y.from).getFullYear()).toBe(2026); expect(new Date(y.to).getFullYear()).toBe(2027);
  });
  it("steps and labels like Android", () => {
    expect(step("month", d("2026-01-31"), 1).getMonth()).toBe(1);
    expect(label("month", d("2026-09-10"))).toBe("September 2026");
    expect(label("year", d("2026-09-10"))).toBe("2026");
    expect(label("week", d("2026-09-10"), d("2026-09-10"))).toBe("Week 37 · Sep 7–13 (so far)");
    expect(label("week", d("2026-09-02"), d("2026-09-10"))).toBe("Week 36 · Aug 31–Sep 6");
    expect(isoWeek(d("2026-01-01"))).toEqual({ week: 1, year: 2026 });
  });
  it("periodsInRange walks back to the period containing the earliest date", () => {
    const refs = periodsInRange("month", d("2026-06-15"), d("2026-09-10"));
    expect(refs.map((r) => r.getMonth())).toEqual([8, 7, 6, 5]);
    expect(periodsInRange("week", d("2027-01-01"), d("2026-09-10"))).toHaveLength(1);
  });
});
