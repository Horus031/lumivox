import { z } from "zod";

const pbiWeightFields = {
  taskCompletionWeight: z.coerce
    .number()
    .min(0, "Task Completion weight cannot be below 0.")
    .max(1, "Task Completion weight cannot exceed 1."),

  focusQualityWeight: z.coerce
    .number()
    .min(0, "Focus Quality weight cannot be below 0.")
    .max(1, "Focus Quality weight cannot exceed 1."),

  deadlineAdherenceWeight: z.coerce
    .number()
    .min(0, "Deadline Adherence weight cannot be below 0.")
    .max(1, "Deadline Adherence weight cannot exceed 1."),

  goalMomentumWeight: z.coerce
    .number()
    .min(0, "Goal Momentum weight cannot be below 0.")
    .max(1, "Goal Momentum weight cannot exceed 1."),

  consistencyWeight: z.coerce
    .number()
    .min(0, "Consistency weight cannot be below 0.")
    .max(1, "Consistency weight cannot exceed 1."),
};

export const onboardingSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, "Full name is required.")
      .max(120, "Full name must be at most 120 characters."),

    timezone: z
      .string()
      .trim()
      .min(1, "Timezone is required."),

    ...pbiWeightFields,
  })
  .superRefine((data, ctx) => {
    const total =
      data.taskCompletionWeight +
      data.focusQualityWeight +
      data.deadlineAdherenceWeight +
      data.goalMomentumWeight +
      data.consistencyWeight;

    if (Math.abs(total - 1) > 0.0001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["taskCompletionWeight"],
        message: `The total PBI weight must equal 1.0. Current total: ${total.toFixed(
          2
        )}`,
      });
    }
  });

export type OnboardingInput = z.infer<typeof onboardingSchema>;