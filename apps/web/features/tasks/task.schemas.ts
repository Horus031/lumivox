import { z } from "zod";

import { TASK_STATUS_VALUES } from "./task-status";
import { DIRECT_TASK_STATUS_TARGETS } from "./task-transition";

const taskTitleSchema = z
  .string()
  .trim()
  .min(1, "Task title is required.")
  .max(160, "Task title must be at most 160 characters.");

const taskDescriptionSchema = z
  .string()
  .trim()
  .max(1200, "Description must be at most 1200 characters.")
  .optional()
  .or(z.literal(""));

const taskPrioritySchema = z.enum(
  ["low", "medium", "high", "critical"],
  {
    message: "Invalid task priority.",
  },
);

export const createTaskSchema = z.object({
  title: taskTitleSchema,

  description: taskDescriptionSchema,

  goalId: z
    .string()
    .uuid("Invalid goal id.")
    .optional()
    .or(z.literal("")),

  priority: taskPrioritySchema,

  estimatedMinutes: z.coerce
    .number()
    .int("Estimated minutes must be an integer.")
    .min(0, "Estimated minutes cannot be negative.")
    .optional(),

  dueAt: z.string().optional().or(z.literal("")),
});

export const createSubtaskSchema = z.object({
  parentTaskId: z.string().uuid("Invalid parent task id."),
  title: taskTitleSchema,
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

export type CreateTaskInput =
  z.infer<typeof createTaskSchema>;

export type CreateSubtaskInput =
  z.infer<typeof createSubtaskSchema>;

export type UpdateTaskInput =
  z.infer<typeof updateTaskSchema>;

export type TransitionTaskStatusInput =
  z.infer<typeof transitionTaskStatusSchema>;