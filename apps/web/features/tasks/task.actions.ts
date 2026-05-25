"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";

import {
  createTaskSchema,
  deleteTaskSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "./task.schemas";
import { invalidateEngagementCache, recalculateEngagementForUser } from "../engagement-retention/engagement-retention.server";

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

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath("/goals");

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

    try {
      await invalidateEngagementCache(user.id);
      await recalculateEngagementForUser(user.id);
    } catch (error) {
      console.error(
        "Failed to auto refresh engagement after task completion:",
        error,
      );
    }

    revalidatePath("/dashboard");
    revalidatePath("/tasks");
    revalidatePath("/settings");
    revalidatePath("/", "layout");

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath("/goals");

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
    const { supabase } = await requireUser();

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

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath("/goals");

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
