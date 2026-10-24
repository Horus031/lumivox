import { format, isValid, parse } from "date-fns";

/** Parse date-only storage values without UTC conversion or a one-day timezone shift. */
export function parseLocalDate(value: string | null | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = parse(value, "yyyy-MM-dd", new Date(2000, 0, 1));
  return isValid(date) ? date : undefined;
}

export function formatLocalDate(value: Date | undefined): string {
  return value ? format(value, "yyyy-MM-dd") : "";
}
