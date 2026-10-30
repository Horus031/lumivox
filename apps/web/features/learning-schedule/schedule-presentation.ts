/** Format a stored calendar date, never reinterpret the scheduled wall clock in the device zone. */
export function formatStudyDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-CA", {
    timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(`${value}T12:00:00Z`));
}

export type ScheduleErrorCode = "loadFailed" | "saveFailed" | "invalidInput" | "notFound" | "notEligible" | "conflict" | "uncertain" | "invalidTime" | "dstGap" | "invalidDate" | "dateRange" | "slotCount" | "invalidWeekday" | "overlap" | "invalidTimezone" | "occurrenceLimit" | "futureDates" | "empty";
export class ScheduleValidationError extends Error {
  constructor(public readonly code: ScheduleErrorCode, message: string) { super(message); }
}
