"use server";

import {
  revalidatePath,
} from "next/cache";

import { z } from "zod";

import type {
  ActionResult,
} from "@/lib/actions/action-result";

import {
  fetchAiApi,
} from "@/lib/ai-api/fetch-ai-api";

import {
  requireUser,
} from "@/lib/auth/require-user";

import {
  checkRateLimit,
  formatRateLimitMessage,
} from "@/lib/redis/rate-limit";

import type {
  LatestTaskReviewResponse,
  TaskReviewAttempt,
} from "./task-review.types";


const requestTaskReviewSchema =
  z.object({
    taskId: z
      .string()
      .uuid(),

    preferredLocale:
      z.enum([
        "auto",
        "en",
        "vi",
      ])
      .default("auto"),

    passThreshold:
      z.number()
      .int()
      .min(50)
      .max(100)
      .default(70),
  });


const latestTaskReviewSchema =
  z.object({
    taskId: z
      .string()
      .uuid(),
  });


export async function requestTaskReviewAction(
  input: {
    taskId: string;

    preferredLocale?:
      | "auto"
      | "en"
      | "vi";

    passThreshold?: number;
  },
): Promise<
  ActionResult<TaskReviewAttempt>
> {
  const parsed =
    requestTaskReviewSchema
      .safeParse(input);

  if (!parsed.success) {
    return {
      success: false,

      message:
        "Invalid review request.",

      fieldErrors:
        parsed.error
          .flatten()
          .fieldErrors,
    };
  }

  try {
    const {
      supabase,
      user,
    } = await requireUser();

    const rateLimit =
      await checkRateLimit({
        key:
          `task-review-generate:${user.id}`,

        limit: 3,

        window: "10 m",
      });

    if (!rateLimit.success) {
      return {
        success: false,

        message:
          formatRateLimitMessage(
            rateLimit.reset,
          ),
      };
    }

    const {
      data: task,
      error,
    } = await supabase
      .from("tasks")
      .select(
        `
          id,
          user_id,
          parent_task_id,
          status,
          updated_at
        `,
      )
      .eq(
        "id",
        parsed.data.taskId,
      )
      .eq(
        "user_id",
        user.id,
      )
      .maybeSingle();

    if (
      error ||
      !task
    ) {
      return {
        success: false,

        message:
          "Task not found.",
      };
    }

    if (
      task.parent_task_id
      !== null
    ) {
      return {
        success: false,

        message:
          "Subtasks cannot enter AI Review directly.",
      };
    }

    if (
      task.status
        !== "in_progress"
      &&
      task.status
        !== "overdue"
    ) {
      return {
        success: false,

        message:
          "Start the task before requesting AI Review.",
      };
    }

    const response =
      await fetchAiApi<
        TaskReviewAttempt
      >({
        path:
          "/api/v1/task-reviews/generate",

        body: {
          user_id:
            user.id,

          task_id:
            task.id,

          expected_status:
            task.status,

          expected_updated_at:
            task.updated_at,

          preferred_locale:
            parsed.data
              .preferredLocale,

          pass_threshold:
            parsed.data
              .passThreshold,

          include_goal_documents:
            true,

          top_k:
            8,
        },
      });

    revalidatePath(
      "/workspace",
    );

    revalidatePath(
      "/tasks",
    );

    return {
      success: true,

      message:
        "AI Review is ready.",

      data:
        response,
    };
  } catch (error) {
    return {
      success: false,

      message:
        error instanceof Error
          ? error.message
          : "Failed to generate AI Review.",
    };
  }
}


export async function getLatestTaskReviewAction(
  taskId: string,
): Promise<
  ActionResult<
    TaskReviewAttempt | null
  >
> {
  const parsed =
    latestTaskReviewSchema
      .safeParse({
        taskId,
      });

  if (!parsed.success) {
    return {
      success: false,

      message:
        "Invalid task id.",
    };
  }

  try {
    const {
      user,
    } = await requireUser();

    const response =
      await fetchAiApi<
        LatestTaskReviewResponse
      >({
        path:
          "/api/v1/task-reviews/latest",

        body: {
          user_id:
            user.id,

          task_id:
            parsed.data.taskId,
        },
      });

    return {
      success: true,

      message:
        "Review loaded.",

      data:
        response.attempt,
    };
  } catch (error) {
    return {
      success: false,

      message:
        error instanceof Error
          ? error.message
          : "Failed to load AI Review.",
    };
  }
}