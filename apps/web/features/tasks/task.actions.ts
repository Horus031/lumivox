"use server";

import { getTranslations } from "next-intl/server";
import { scheduleEngagementRecalculation } from "@/features/engagement-retention/engagement-retention.background";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";

import {
  createTaskSchema,
  deleteTaskSchema,
  updateTaskSchema,
  transitionTaskStatusSchema,
  type TransitionTaskStatusInput,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "./task.schemas";
import type { TaskStatus } from "./task-status";
import {
  canDirectlyTransitionTask,
  getTaskBoardStatus,
  getTaskCompletedAt,
  isDirectTaskStatusTarget,
} from "./task-transition";

type TransitionTaskResult = {
  taskId: string;
  status: TaskStatus;
  completedAt: string | null;
  updatedAt: string;
};

export async function transitionTaskStatusAction(
  input: TransitionTaskStatusInput,
): Promise<ActionResult<TransitionTaskResult>> {
  const t = await getTranslations("workspace.board");
  const parsed = transitionTaskStatusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: t("invalidTransition"),
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase, user } = await requireUser();
    const { taskId, targetStatus, expectedStatus, expectedUpdatedAt } =
      parsed.data;
    const { data: task, error: fetchError } = await supabase
      .from("tasks")
      .select("id, user_id, status, due_at, completed_at, updated_at")
      .eq("id", taskId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (fetchError) return { success: false, message: t("transitionFailed") };
    if (!task) return { success: false, message: t("taskNotFound") };
    if (
      task.status !== expectedStatus ||
      task.updated_at !== expectedUpdatedAt
    ) {
      return { success: false, message: t("staleTask") };
    }
    const now = new Date();
    if (
      !canDirectlyTransitionTask(getTaskBoardStatus(task, now), targetStatus)
    ) {
      return { success: false, message: t("invalidTransition") };
    }
    const completedAt = getTaskCompletedAt(task, targetStatus, now);
    const { data: updatedTask, error } = await supabase
      .from("tasks")
      .update({ status: targetStatus, completed_at: completedAt })
      .eq("id", taskId)
      .eq("user_id", user.id)
      .eq("status", expectedStatus)
      .eq("updated_at", expectedUpdatedAt)
      .select("id, status, completed_at, updated_at")
      .maybeSingle();
    if (error) return { success: false, message: t("transitionFailed") };
    if (!updatedTask) return { success: false, message: t("staleTask") };

    if (targetStatus === "completed") {
      scheduleEngagementRecalculation({
        userId: user.id,
        source: "task-transition",
        activity: { type: "task", id: taskId },
      });
    } else if (task.status === "completed") {
      scheduleEngagementRecalculation({
        userId: user.id,
        source: "task-transition",
      });
    }
    return {
      success: true,
      message: t("transitionSucceeded"),
      data: {
        taskId: updatedTask.id,
        status: updatedTask.status,
        completedAt: updatedTask.completed_at,
        updatedAt: updatedTask.updated_at,
      },
    };
  } catch {
    return { success: false, message: t("transitionFailed") };
  }
}

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
      expectedStatus,
      expectedUpdatedAt,
    } = parsed.data;

    const { data: existingTask, error: existingTaskError } = await supabase
      .from("tasks")
      .select("status, due_at, completed_at, updated_at")
      .eq("id", taskId)
      .eq("user_id", user.id)
      .single();

    if (existingTaskError || !existingTask) {
      return {
        success: false,
        message: "Task not found.",
      };
    }

    const t = await getTranslations("workspace.board");
    if (
      existingTask.status !== expectedStatus ||
      existingTask.updated_at !== expectedUpdatedAt
    ) {
      return { success: false, message: t("staleTask") };
    }
    const now = new Date();
    if (
      status !== existingTask.status &&
      (!isDirectTaskStatusTarget(status) ||
        !canDirectlyTransitionTask(
          getTaskBoardStatus(existingTask, now),
          status,
        ))
    ) {
      return { success: false, message: t("invalidTransition") };
    }
    const completedAtValue = getTaskCompletedAt(existingTask, status, now);

    const { data: updatedTask, error } = await supabase
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
      .eq("id", taskId)
      .eq("user_id", user.id)
      .eq("status", expectedStatus)
      .eq("updated_at", expectedUpdatedAt)
      .select("id")
      .maybeSingle();

    if (error) {
      return {
        success: false,
        message: `Failed to update task: ${error.message}`,
      };
    }

    if (!updatedTask) {
      return { success: false, message: t("staleTask") };
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
