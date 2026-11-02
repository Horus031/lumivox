import { describe, expect, it } from "vitest";

import {
  generateStudyOccurrences,
  SCHEDULE_LIMITS,
  type WeeklySlot,
} from "./schedule-engine";

const baseSlots: WeeklySlot[] = [
  {
    weekday: 1,
    startTime: "19:00",
    endTime: "20:30",
  },
];

function createInput(
  overrides: Partial<Parameters<typeof generateStudyOccurrences>[0]> = {},
) {
  return {
    startsOn: "2026-11-02",
    endsOn: "2026-11-08",
    timezone: "Asia/Ho_Chi_Minh",
    slots: baseSlots,
    ...overrides,
  };
}

describe("Learning Schedule boundary cases", () => {
  it("supports a one-day inclusive schedule", () => {
    const sessions = generateStudyOccurrences(
      createInput({
        startsOn: "2026-11-02",
        endsOn: "2026-11-02",
      }),
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0].localDate).toBe("2026-11-02");
  });

  it("returns no occurrences when no weekday matches", () => {
    const sessions = generateStudyOccurrences(
      createInput({
        startsOn: "2026-11-03",
        endsOn: "2026-11-03",
      }),
    );

    expect(sessions).toEqual([]);
  });

  it("handles a leap-day occurrence", () => {
    const sessions = generateStudyOccurrences(
      createInput({
        startsOn: "2028-02-29",
        endsOn: "2028-02-29",
        slots: [
          {
            weekday: 2,
            startTime: "19:00",
            endTime: "20:30",
          },
        ],
      }),
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0].localDate).toBe("2028-02-29");
  });

  it("handles a schedule crossing the year boundary", () => {
    const sessions = generateStudyOccurrences(
      createInput({
        startsOn: "2026-12-28",
        endsOn: "2027-01-04",
      }),
    );

    expect(sessions.map((s) => s.localDate)).toEqual([
      "2026-12-28",
      "2027-01-04",
    ]);
  });

  it("rejects an inverted date range", () => {
    expect(() =>
      generateStudyOccurrences(
        createInput({
          startsOn: "2026-11-08",
          endsOn: "2026-11-02",
        }),
      ),
    ).toThrow();
  });

  it("rejects a schedule beyond the maximum day limit", () => {
    expect(() =>
      generateStudyOccurrences(
        createInput({
          startsOn: "2026-01-01",
          endsOn: "2027-01-02",
        }),
      ),
    ).toThrow(/Schedule must cover/);
  });

  it("rejects schedules with zero slots", () => {
    expect(() => generateStudyOccurrences(createInput({ slots: [] }))).toThrow(
      /weekly slots/,
    );
  });

  it("rejects more than the maximum weekly slots", () => {
    const slots = Array.from(
      { length: SCHEDULE_LIMITS.maxSlots + 1 },
      (_, index) => ({
        weekday: (index % 7) + 1,
        startTime: "08:00",
        endTime: "09:00",
      }),
    );

    expect(() => generateStudyOccurrences(createInput({ slots }))).toThrow(
      /weekly slots/,
    );
  });

  it("rejects occurrence counts over the limit", () => {
    const slots: WeeklySlot[] = Array.from({ length: 21 }, (_, index) => ({
      weekday: Math.floor(index / 3) + 1,
      startTime: `${String(index % 3).padStart(2, "0")}:00`,
      endTime: `${String(index % 3).padStart(2, "0")}:30`,
    }));

    expect(() =>
      generateStudyOccurrences(
        createInput({
          startsOn: "2026-01-01",
          endsOn: "2027-01-01",
          slots,
        }),
      ),
    ).toThrow(/Occurrence limit exceeded/);
  });

  it("rejects fixed UTC offset as IANA timezone input", () => {
    expect(() =>
      generateStudyOccurrences(createInput({ timezone: "+07:00" })),
    ).toThrow(/Invalid IANA timezone/);
  });

  it("accepts UTC as a valid named timezone", () => {
    const sessions = generateStudyOccurrences(createInput({ timezone: "UTC" }));

    expect(sessions[0].scheduledStartAt).toBe("2026-11-02T19:00:00Z");
  });

  it("rejects invalid ISO weekdays", () => {
    for (const weekday of [0, 8, 1.5]) {
      expect(() =>
        generateStudyOccurrences(
          createInput({
            slots: [
              {
                weekday,
                startTime: "19:00",
                endTime: "20:30",
              },
            ],
          }),
        ),
      ).toThrow(/Invalid ISO weekday/);
    }
  });

  it("produces stable occurrence keys for identical input", () => {
    const input = createInput();

    const first = generateStudyOccurrences(input);
    const second = generateStudyOccurrences(input);

    expect(first).toEqual(second);
    expect(first[0].occurrenceKey).toBe("2026-11-02|1|19:00|20:30");
  });
});
