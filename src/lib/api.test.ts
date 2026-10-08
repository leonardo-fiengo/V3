import { describe, expect, it } from "vitest";
import { monthRange, shiftMonth } from "./api";
describe("calendar boundaries used by filters and reports", () => {
  it("handles leap years and year transitions", () => {
    expect(monthRange("2024-02")).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
    expect(monthRange("2026-02").end).toBe("2026-02-28");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});
