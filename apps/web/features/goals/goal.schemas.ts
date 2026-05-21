import { z } from "zod";

export const createGoalSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Goal title is required.")
    .max(160, "Goal title must be at most 160 characters."),

  description: z
    .string()
    .trim()
    .max(1000, "Description must be at most 1000 characters.")
    .optional()
    .or(z.literal("")),

  goalType: z.enum(["short_term", "long_term"], {
    message: "Invalid goal type.",
  }),

  startDate: z.string().optional().or(z.literal("")),

  targetDate: z.string().optional().or(z.literal("")),
});

export const updateGoalSchema = createGoalSchema.extend({
  goalId: z.string().uuid("Invalid goal id."),

  status: z.enum(["active", "completed", "paused", "archived"], {
    message: "Invalid goal status.",
  }),

  progressPercent: z.coerce
    .number()
    .min(0, "Progress cannot be below 0.")
    .max(100, "Progress cannot exceed 100."),
});

export const deleteGoalSchema = z.object({
  goalId: z.string().uuid("Invalid goal id."),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
