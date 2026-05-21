import { z } from "zod";

export const logDistractionSchema = z.object({
  sessionId: z.string().uuid("Invalid session id."),

  distractionType: z.enum([
    "social_media",
    "messaging",
    "external_interrupt",
    "fatigue",
    "other",
  ]),

  durationSeconds: z.coerce
    .number()
    .int("Duration must be an integer.")
    .min(0, "Duration cannot be negative.")
    .max(7200, "Duration cannot exceed 2 hours."),

  note: z
    .string()
    .trim()
    .max(500, "Note must be at most 500 characters.")
    .optional()
    .or(z.literal("")),
});

export type LogDistractionInput = z.infer<
  typeof logDistractionSchema
>;