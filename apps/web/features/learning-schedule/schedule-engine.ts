import { Temporal } from "@js-temporal/polyfill";

export type WeeklySlot = {
  weekday: number; // ISO: Monday = 1, Sunday = 7
  startTime: string; // HH:mm
  endTime: string; // HH:mm; same-day only
};

export type StudyScheduleInput = {
  startsOn: string; // YYYY-MM-DD
  endsOn: string; // YYYY-MM-DD, inclusive
  timezone: string; // IANA name
  slots: WeeklySlot[];
};

export type GeneratedStudySession = {
  localDate: string;
  localStartTime: string;
  localEndTime: string;
  timezone: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  slotIndex: number;
  occurrenceKey: string;
};

export const SCHEDULE_LIMITS = {
  maxDays: 366,
  maxSlots: 21,
  maxOccurrences: 1000,
} as const;

function parseDate(value: string): Temporal.PlainDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  try {
    const date = Temporal.PlainDate.from(value, { overflow: "reject" });
    if (date.toString() !== value) throw new Error("Noncanonical date");
    return date;
  } catch {
    throw new Error(`Invalid ISO date: ${value}`);
  }
}

function parseTime(value: string): Temporal.PlainTime {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(`Invalid HH:mm time: ${value}`);
  }
  return Temporal.PlainTime.from(value);
}

function asMinutes(time: Temporal.PlainTime): number {
  return time.hour * 60 + time.minute;
}

function resolveLocal(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  timezone: string,
): Temporal.ZonedDateTime {
  // 'earlier' selects the earlier instant in a fall-back fold.
  const zoned = Temporal.ZonedDateTime.from(
    {
      timeZone: timezone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour: time.hour,
      minute: time.minute,
    },
    { disambiguation: "earlier", overflow: "reject" },
  );
  // A spring-forward gap shifts wall-clock time under 'earlier'; reject it.
  if (
    zoned.year !== date.year || zoned.month !== date.month || zoned.day !== date.day ||
    zoned.hour !== time.hour || zoned.minute !== time.minute
  ) {
    throw new Error(`Nonexistent local time ${date.toString()} ${time.toString().slice(0, 5)} in ${timezone}`);
  }
  return zoned;
}

/** Pure calculation: does not access Supabase, user state or system timezone. */
export function generateStudyOccurrences(input: StudyScheduleInput): GeneratedStudySession[] {
  const start = parseDate(input.startsOn);
  const end = parseDate(input.endsOn);
  const days = start.until(end, { largestUnit: "days" }).days + 1;
  if (days <= 0 || days > SCHEDULE_LIMITS.maxDays) {
    throw new Error(`Schedule must cover between 1 and ${SCHEDULE_LIMITS.maxDays} days`);
  }
  if (!input.slots.length || input.slots.length > SCHEDULE_LIMITS.maxSlots) {
    throw new Error(`Schedule requires 1–${SCHEDULE_LIMITS.maxSlots} weekly slots`);
  }
  // Validate timezone before producing any output, including weeks with no matches.
  try {
    Temporal.ZonedDateTime.from({
      timeZone: input.timezone, year: start.year, month: start.month, day: start.day,
    });
  } catch {
    throw new Error(`Invalid timezone: ${input.timezone}`);
  }

  const normalized = input.slots.map((slot, index) => {
    if (!Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 7) {
      throw new Error(`Invalid ISO weekday at slot ${index}`);
    }
    const from = asMinutes(parseTime(slot.startTime));
    const to = asMinutes(parseTime(slot.endTime));
    if (from >= to) throw new Error(`Slot ${index} must end on the same day after it starts`);
    return { ...slot, index, from, to };
  });
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i]; const b = normalized[j];
      if (a.weekday === b.weekday && a.from < b.to && b.from < a.to) {
        throw new Error(`Overlapping weekly slots ${i} and ${j}`);
      }
    }
  }

  const result: GeneratedStudySession[] = [];
  for (let date = start; Temporal.PlainDate.compare(date, end) <= 0; date = date.add({ days: 1 })) {
    const todaySlots = normalized.filter(slot => slot.weekday === date.dayOfWeek)
      .sort((a, b) => a.from - b.from);
    for (const slot of todaySlots) {
      if (result.length >= SCHEDULE_LIMITS.maxOccurrences) throw new Error("Occurrence limit exceeded");
      const startTime = parseTime(slot.startTime);
      const endTime = parseTime(slot.endTime);
      const from = resolveLocal(date, startTime, input.timezone);
      const to = resolveLocal(date, endTime, input.timezone);
      if (Temporal.Instant.compare(from.toInstant(), to.toInstant()) >= 0) {
        throw new Error(`Nonpositive duration at ${date.toString()} in ${input.timezone}`);
      }
      result.push({
        localDate: date.toString(), localStartTime: slot.startTime,
        localEndTime: slot.endTime, timezone: input.timezone,
        scheduledStartAt: from.toInstant().toString(),
        scheduledEndAt: to.toInstant().toString(),
        slotIndex: slot.index,
        // Stable within the same schedule definition; DB identity strategy is Phase 03.3.
        occurrenceKey: `${date.toString()}|${slot.weekday}|${slot.startTime}|${slot.endTime}`,
      });
    }
  }
  return result;
}
