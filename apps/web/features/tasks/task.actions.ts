"use server";

import { scheduleEngagementRecalculation } from "@/features/engagement-retention/engagement-retention.background";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";

import {
  createTaskSchema,
  deleteTaskSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "./task.schemas";

export async function createTaskAction(
  input: CreateTaskInput,
): Promise<ActionResult> {
  const parsed = createTaskSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid task data.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase, user } = await requireUser();

    const { title, description, goalId, priority, estimatedMinutes, dueAt } =
      parsed.data;

    const { error } = await supabase.from("tasks").insert({
      user_id: user.id,
      goal_id: goalId || null,
      title,
      description: description || null,
      priority,
      estimated_minutes: estimatedMinutes ?? null,
      due_at: dueAt || null,
    });

    if (error) {
      return {
        success: false,
        message: `Failed to create task: ${error.message}`,
      };
    }

    return {
      success: true,
      message: "Task created successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while creating task.",
    };
  }
}

export async function updateTaskAction(
  input: UpdateTaskInput,
): Promise<ActionResult> {
  const parsed = updateTaskSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid task data.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase, user } = await requireUser();

    const {
      taskId,
      title,
      description,
      goalId,
      priority,
      estimatedMinutes,
      dueAt,
      status,
      completedAt,
    } = parsed.data;

    const { data: existingTask, error: existingTaskError } = await supabase
      .from("tasks")
      .select("status")
      .eq("id", taskId)
      .single();

    if (existingTaskError || !existingTask) {
      return {
        success: false,
        message: "Task not found.",
      };
    }

    const completedAtValue =
      status === "completed" ? completedAt || new Date().toISOString() : null;

    const { error } = await supabase
      .from("tasks")
      .update({
        goal_id: goalId || null,
        title,
        description: description || null,
        priority,
        estimated_minutes: estimatedMinutes ?? null,
        due_at: dueAt || null,
        status,
        completed_at: completedAtValue,
      })
      .eq("id", taskId);

    if (error) {
      return {
        success: false,
        message: `Failed to update task: ${error.message}`,
      };
    }

    if (status === "completed" && existingTask.status !== "completed") {
      scheduleEngagementRecalculation({
        userId: user.id,
        source: "task-update",
        activity: {
          type: "task",
          id: taskId,
        },
      });
    } else if (existingTask.status === "completed") {
      // Reverting or editing an already-completed task can alter historical
      // validity, so use the canonical reconciliation outside the request path.
      scheduleEngagementRecalculation({
        userId: user.id,
        source: "task-update",
      });
    }

    return {
      success: true,
      message: "Task updated successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while updating task.",
    };
  }
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  const parsed = deleteTaskSchema.safeParse({ taskId });

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid task id.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase, user } = await requireUser();

    const { data: existingTask, error: existingTaskError } = await supabase
      .from("tasks")
      .select("status")
      .eq("id", parsed.data.taskId)
      .single();

    if (existingTaskError || !existingTask) {
      return {
        success: false,
        message: "Task not found.",
      };
    }

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", parsed.data.taskId);

    if (error) {
      return {
        success: false,
        message: `Failed to delete task: ${error.message}`,
      };
    }

    if (existingTask.status === "completed") {
      scheduleEngagementRecalculation({
        userId: user.id,
        source: "task-update",
      });
    }

    return {
      success: true,
      message: "Task deleted successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while deleting task.",
    };
  }
}
