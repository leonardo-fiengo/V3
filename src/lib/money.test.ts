import { describe, it, expect } from "vitest";
import { minor, decimal, formatMinor, chartNumber } from "./money";
describe("exact display boundary", () => {
  it("keeps cents and large integer precision", () => {
    expect(minor("0.29") + minor("0.01")).toBe(30n);
    expect(decimal(-1n)).toBe("-0.01");
    expect(formatMinor(-1n, "en-GB", "EUR")).toBe("-€0.01");
    expect(formatMinor(99n, "en-GB", "EUR", true)).toBe("+€0.99");
    expect(formatMinor(900719925474099101n, "en-GB", "EUR")).toBe(
      "€9,007,199,254,740,991.01",
    );
  });
  it("rejects unsafe chart conversions and excess precision", () => {
    expect(() => chartNumber("9007199254740992")).toThrow();
    expect(() => minor("0.001")).toThrow();
    expect(() => minor("1e3")).toThrow();
  });
});
