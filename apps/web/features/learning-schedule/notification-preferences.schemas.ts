import { z } from "zod";
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const timezone = z.string().min(1).max(128).refine(value => {
  if (value.includes(":") || value.startsWith("posix/") || value.startsWith("right/")) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); return true; } catch { return false; }
}, "Invalid IANA timezone");
export const studyNotificationPreferencesSchema = z.object({
  studyEmailEnabled: z.boolean(), leadMinutes: z.number().int().refine(value => [5,15,30,60].includes(value)),
  quietHoursEnabled: z.boolean(), quietStartLocal: clock.nullable(), quietEndLocal: clock.nullable(), timezone: timezone.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.quietHoursEnabled && (!value.quietStartLocal || !value.quietEndLocal || !value.timezone || value.quietStartLocal === value.quietEndLocal)) {
    ctx.addIssue({ code: "custom", message: "Invalid quiet hours", path: ["quietHoursEnabled"] });
  }
});
export const studyNotificationTaskOverrideSchema = z.object({ taskId: z.string().uuid(), enabled: z.boolean() }).strict();
export type StudyNotificationPreferencesInput = z.infer<typeof studyNotificationPreferencesSchema>;
export type StudyNotificationPreferences = StudyNotificationPreferencesInput & { consentedAt: string | null; updatedAt: string | null };
