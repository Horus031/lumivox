import { describe, expect, it } from "vitest";
import { generateStudyOccurrences } from "./schedule-engine";

const base = {
  startsOn: "2026-11-02",
  endsOn: "2026-11-08",
  timezone: "Asia/Ho_Chi_Minh",
  slots: [
    { weekday: 1, startTime: "19:00", endTime: "20:30" },
    { weekday: 3, startTime: "19:00", endTime: "20:30" },
    { weekday: 5, startTime: "19:00", endTime: "20:30" },
  ],
};

describe("generateStudyOccurrences", () => {
  it("generates inclusive ISO weekdays in chronological order", () => {
    const result = generateStudyOccurrences(base);
    expect(result.map(x => x.localDate)).toEqual(["2026-11-02", "2026-11-04", "2026-11-06"]);
    expect(result[0].scheduledStartAt).toBe("2026-11-02T12:00:00Z");
    expect(result[0].scheduledEndAt).toBe("2026-11-02T13:30:00Z");
  });
  it("accepts adjacent slots but rejects overlapping slots", () => {
    const adjacent = { ...base, slots: [
      { weekday: 1, startTime: "19:00", endTime: "20:30" },
      { weekday: 1, startTime: "20:30", endTime: "21:00" },
    ] };
    expect(generateStudyOccurrences(adjacent)).toHaveLength(2);
    expect(() => generateStudyOccurrences({ ...adjacent, slots: [
      adjacent.slots[0], { weekday: 1, startTime: "20:00", endTime: "21:00" },
    ] })).toThrow(/Overlapping/);
  });
  it("rejects malformed date/time and timezone", () => {
    expect(() => generateStudyOccurrences({ ...base, startsOn: "2026-02-30" })).toThrow();
    expect(() => generateStudyOccurrences({ ...base, timezone: "Bad/Zone" })).toThrow();
    expect(() => generateStudyOccurrences({ ...base, slots: [{ weekday: 1, startTime: "24:00", endTime: "24:30" }] })).toThrow();
  });
  it("rejects spring-forward nonexistent times", () => {
    expect(() => generateStudyOccurrences({
      startsOn: "2026-03-08", endsOn: "2026-03-08", timezone: "America/New_York",
      slots: [{ weekday: 7, startTime: "02:30", endTime: "03:30" }],
    })).toThrow(/Nonexistent local time/);
  });
  it("selects earlier offset in fall-back fold", () => {
    const [session] = generateStudyOccurrences({
      startsOn: "2026-11-01", endsOn: "2026-11-01", timezone: "America/New_York",
      slots: [{ weekday: 7, startTime: "01:30", endTime: "02:30" }],
    });
    expect(session.scheduledStartAt).toBe("2026-11-01T05:30:00Z");
    expect(session.scheduledEndAt).toBe("2026-11-01T07:30:00Z");
  });
  it("does not alter output based on system local timezone", () => {
    expect(generateStudyOccurrences(base)).toEqual(generateStudyOccurrences(structuredClone(base)));
  });
});
