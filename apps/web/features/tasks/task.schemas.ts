import { z } from "zod";
import { TASK_STATUS_VALUES } from "./task-status";
import { DIRECT_TASK_STATUS_TARGETS } from "./task-transition";

export const createTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Task title is required.")
    .max(160, "Task title must be at most 160 characters."),

  description: z
    .string()
    .trim()
    .max(1200, "Description must be at most 1200 characters.")
    .optional()
    .or(z.literal("")),

  goalId: z.string().uuid("Invalid goal id.").optional().or(z.literal("")),

  priority: z.enum(["low", "medium", "high", "critical"], {
    message: "Invalid task priority.",
  }),

  estimatedMinutes: z.coerce
    .number()
    .int("Estimated minutes must be an integer.")
    .min(0, "Estimated minutes cannot be negative.")
    .optional(),

  dueAt: z.string().optional().or(z.literal("")),
});

export const updateTaskSchema = createTaskSchema.extend({
  taskId: z.string().uuid("Invalid task id."),

  status: z.enum(TASK_STATUS_VALUES, {
    message: "Invalid task status.",
  }),

  expectedStatus: z.enum(TASK_STATUS_VALUES),
  expectedUpdatedAt: z.string().min(1),
});

export const deleteTaskSchema = z.object({
  taskId: z.string().uuid("Invalid task id."),
});

export const transitionTaskStatusSchema = z.object({
  taskId: z.string().uuid("Invalid task id."),

  targetStatus: z.enum(DIRECT_TASK_STATUS_TARGETS),

  expectedStatus: z.enum(TASK_STATUS_VALUES),

  expectedUpdatedAt: z.string().min(1),
});

export type TransitionTaskStatusInput = z.infer<
  typeof transitionTaskStatusSchema
>;

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
