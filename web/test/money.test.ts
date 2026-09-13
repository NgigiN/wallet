import { describe, expect, it } from "vitest";
import { formatKes, parseKesInput } from "../src/logic/money";

describe("formatKes", () => {
  it("formats whole and fractional cents like Android", () => {
    expect(formatKes(234000)).toBe("Ksh 2,340");
    expect(formatKes(234050)).toBe("Ksh 2,340.50");
    expect(formatKes(-50000)).toBe("−Ksh 500");
    expect(formatKes(0)).toBe("Ksh 0");
  });
});
describe("parseKesInput", () => {
  it("accepts commas and decimals, rejects junk", () => {
    expect(parseKesInput("2,340.5")).toBe(234050);
    expect(parseKesInput("300")).toBe(30000);
    expect(parseKesInput("0")).toBeNull();
    expect(parseKesInput("abc")).toBeNull();
    expect(parseKesInput("12.345")).toBe(1235);
  });
});
