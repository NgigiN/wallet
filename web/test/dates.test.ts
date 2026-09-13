import { describe, expect, it } from "vitest";
import { dayLabel, fromLocalInput, timeAgo, toLocalInput } from "../src/logic/dates";

// vitest.config.ts pins TZ to Asia/Kolkata (UTC+5:30). At UTC the old UTC-slice-then-parse
// bug is invisible, so the pin is what makes these tests a real guard on CI runners.
describe("toLocalInput / fromLocalInput", () => {
  it("runs under the pinned non-UTC zone (otherwise the round-trip tests prove nothing)", () => {
    expect(new Date("2026-09-13T06:08:00.000Z").getTimezoneOffset()).toBe(-330);
  });
  it("differs from the old UTC-slice approach in this zone (the C1 regression)", () => {
    const iso = "2026-09-13T06:08:00.000Z";
    const buggy = new Date(iso.slice(0, 16)).toISOString();
    expect(buggy).not.toBe(iso);
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });
  it("round-trips an instant to the minute", () => {
    const iso = "2026-09-13T06:08:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });
  it("is a fixed point at day, month and year boundaries", () => {
    for (const iso of ["2026-01-01T00:00:00.000Z", "2026-06-30T21:45:00.000Z", "2026-12-31T23:59:00.000Z"]) {
      const value = toLocalInput(iso);
      expect(fromLocalInput(value)).toBe(iso);
      expect(toLocalInput(fromLocalInput(value)!)).toBe(value);
    }
  });
  it("truncates seconds rather than carrying them", () => {
    expect(toLocalInput("2026-09-13T06:08:47.123Z")).toHaveLength(16);
    expect(fromLocalInput(toLocalInput("2026-09-13T06:08:47.123Z"))).toBe("2026-09-13T06:08:00.000Z");
  });
  it("gives null for an empty or unparseable value", () => {
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("tomorrow")).toBeNull();
  });
});

describe("dayLabel", () => {
  it("formats a day key in the local calendar", () => {
    expect(dayLabel("2026-09-01")).toBe("Tue 1 Sep");
    expect(dayLabel("2026-12-31")).toBe("Thu 31 Dec");
  });
});

describe("timeAgo", () => {
  // Built from local-calendar dates so the weekday/day-of-month branches don't depend on the zone.
  const base = new Date(2026, 8, 13, 12, 0, 0);
  const ago = (ms: number) => timeAgo(new Date(base.getTime() - ms).toISOString(), base.getTime());
  it("steps from 'Just now' through minutes, hours, weekday, then a date", () => {
    expect(ago(30_000)).toBe("Just now");
    expect(ago(5 * 60_000)).toBe("5m ago");
    expect(ago(3 * 3_600_000)).toBe("3h ago");
    expect(ago(2 * 86_400_000)).toBe("Fri");
    expect(ago(10 * 86_400_000)).toBe("3 Sep");
  });
});
