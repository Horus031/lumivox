import { z } from "zod";

export const createFocusSessionSchema = z.object({
  taskId: z.string().uuid("Invalid task id.").optional().or(z.literal("")),

  plannedMinutes: z.coerce
    .number()
    .int("Planned minutes must be an integer.")
    .min(1, "Session must be at least 1 minute.")
    .max(240, "Session cannot exceed 240 minutes."),
});

export const sessionIdSchema = z.object({
  sessionId: z.string().uuid("Invalid session id."),
});

export type CreateFocusSessionInput = z.infer<
  typeof createFocusSessionSchema
>;