import { z } from "zod";

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

  status: z.enum(
    ["todo", "in_progress", "completed", "overdue", "cancelled"],
    {
      message: "Invalid task status.",
    }
  ),

  completedAt: z.string().optional().or(z.literal("")),
});

export const deleteTaskSchema = z.object({
  taskId: z.string().uuid("Invalid task id."),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;