import { describe, expect, it } from "vitest";
import { getActualFocusMinutes, getElapsedFocusSeconds, getRemainingFocusSeconds } from "./focus-session-clock";

const session = {
  started_at: "2026-10-17T10:00:00Z", paused_at: null,
  total_paused_seconds: 0, planned_minutes: 25, status: "ongoing" as const,
};
const at = (time: string) => new Date(`2026-10-17T${time}Z`);
describe("legacy focus clock", () => {
  it("has 20 minutes remaining after five minutes", () => {
    expect(getRemainingFocusSeconds(session, at("10:05:00"))).toBe(1200);
  });
  it("freezes an open pause even two hours later", () => {
    const paused = { ...session, status: "paused" as const, paused_at: at("10:05:00").toISOString() };
    expect(getRemainingFocusSeconds(paused, at("12:05:00"))).toBe(1200);
    expect(getActualFocusMinutes(paused, at("12:05:00"))).toBe(5);
  });
  it("clamps overtime remaining to zero and actual minutes to plan", () => {
    expect(getRemainingFocusSeconds(session, at("10:30:00"))).toBe(0);
    expect(getActualFocusMinutes(session, at("10:30:00"))).toBe(25);
  });
  it("excludes a closed 60 second pause after resume", () => {
    const resumed = { ...session, total_paused_seconds: 60 };
    expect(getElapsedFocusSeconds(resumed, at("10:06:00"))).toBe(300);
    expect(getRemainingFocusSeconds(resumed, at("10:06:00"))).toBe(1200);
  });
  it("never returns negative elapsed time with clock skew", () => {
    expect(getElapsedFocusSeconds(session, at("09:59:59"))).toBe(0);
    expect(getActualFocusMinutes({ ...session, total_paused_seconds: 600 }, at("10:01:00"))).toBe(0);
  });
  it("uses timestamp offsets regardless of local timezone", () => {
    expect(getRemainingFocusSeconds({ ...session, started_at: "2026-10-17T17:00:00+07:00" }, at("10:05:00"))).toBe(1200);
  });
  it("floors partial seconds and minutes", () => {
    expect(getElapsedFocusSeconds(session, at("10:01:59.999"))).toBe(119);
    expect(getActualFocusMinutes(session, at("10:01:59.999"))).toBe(1);
  });
});
