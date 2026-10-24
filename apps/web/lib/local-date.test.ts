import { describe, expect, it } from "vitest";
import { formatLocalDate, parseLocalDate } from "./local-date";

describe("date-only form values", () => {
  it.each(["2028-02-29", "2031-01-01", "2026-12-31"])("round-trips %s in local time", (value) => {
    const date = parseLocalDate(value)!;
    expect(date.getHours()).toBe(0);
    expect(formatLocalDate(date)).toBe(value);
  });
  it.each(["", null, undefined, "2027-02-29", "2030-13-01", "2030-02-30", "2030-1-1", "invalid"])("rejects invalid or missing dates: %s", (value) => {
    expect(parseLocalDate(value)).toBeUndefined();
  });
  it("clears optional form values", () => { expect(formatLocalDate(undefined)).toBe(""); });
});
