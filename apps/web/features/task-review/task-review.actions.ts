"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { scheduleEngagementRecalculation } from "@/features/engagement-retention/engagement-retention.background";

import type { ActionResult } from "@/lib/actions/action-result";

import { fetchAiApi } from "@/lib/ai-api/fetch-ai-api";

import { requireUser } from "@/lib/auth/require-user";

import { checkRateLimit, formatRateLimitMessage } from "@/lib/redis/rate-limit";

import type {
  LatestTaskReviewResponse,
  TaskReviewAnswerSubmission,
  TaskReviewAttempt,
} from "./task-review.types";

const requestTaskReviewSchema = z.object({
  taskId: z.string().uuid(),

  requestId: z.string().uuid(),

  preferredLocale: z.enum(["auto", "en", "vi"]).default("auto"),

  passThreshold: z.number().int().min(50).max(100).default(70),
});

const latestTaskReviewSchema = z.object({
  taskId: z.string().uuid(),
});

const answerSchema = z.object({
  questionId: z.string().min(1).max(80),

  selectedOptionIndices: z
    .array(z.number().int().min(0).max(4))
    .min(1)
    .max(5)
    .refine(
      (values) => new Set(values).size === values.length,
      "Selected options must be unique.",
    ),
});

const submitTaskReviewSchema = z.object({
  taskId: z.string().uuid(),

  attemptId: z.string().uuid(),

  answers: z.array(answerSchema).min(1).max(12),
});

export async function requestTaskReviewAction(input: {
  taskId: string;

  requestId: string;

  preferredLocale?: "auto" | "en" | "vi";

  passThreshold?: number;
}): Promise<ActionResult<TaskReviewAttempt>> {
  const parsed = requestTaskReviewSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,

      message: "Invalid review request.",

      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase, user } = await requireUser();
    const rateLimitMode =
      process.env.NODE_ENV === "production" ? "fail-closed" : "fail-open";

    const rateLimit = await checkRateLimit({
      key: `task-review-generate:${user.id}`,

      limit: 3,

      window: "10 m",

      mode: rateLimitMode,
    });

    if (!rateLimit.success) {
      return {
        success: false,

        message: rateLimit.message ?? formatRateLimitMessage(rateLimit.reset),
      };
    }

    const { data: task, error } = await supabase
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
      .eq("id", parsed.data.taskId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !task) {
      return {
        success: false,

        message: "Task not found.",
      };
    }

    if (task.parent_task_id !== null) {
      return {
        success: false,

        message: "Subtasks cannot enter AI Review directly.",
      };
    }

    if (task.status !== "in_progress" && task.status !== "overdue") {
      return {
        success: false,

        message: "Start the task before requesting AI Review.",
      };
    }

    const response = await fetchAiApi<TaskReviewAttempt>({
      path: "/api/v1/task-reviews/generate",

      requestId: parsed.data.requestId,

      timeoutMs: 35_000,

      retries: 1,

      body: {
        user_id: user.id,

        task_id: task.id,

        expected_status: task.status,

        expected_updated_at: task.updated_at,

        preferred_locale: parsed.data.preferredLocale,

        pass_threshold: parsed.data.passThreshold,

        include_goal_documents: true,

        top_k: 8,

        request_id: parsed.data.requestId,
      },
    });

    revalidatePath("/workspace");

    return {
      success: true,

      message: "AI Review is ready.",

      data: response,
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
): Promise<ActionResult<TaskReviewAttempt | null>> {
  const parsed = latestTaskReviewSchema.safeParse({
    taskId,
  });

  if (!parsed.success) {
    return {
      success: false,

      message: "Invalid task id.",
    };
  }

  try {
    const { user } = await requireUser();

    const response = await fetchAiApi<LatestTaskReviewResponse>({
      path: "/api/v1/task-reviews/latest",

      body: {
        user_id: user.id,

        task_id: parsed.data.taskId,
      },
    });

    return {
      success: true,

      message: "Review loaded.",

      data: response.attempt,
    };
  } catch (error) {
    return {
      success: false,

      message:
        error instanceof Error ? error.message : "Failed to load AI Review.",
    };
  }
}

export async function submitTaskReviewAction(input: {
  taskId: string;

  attemptId: string;

  answers: TaskReviewAnswerSubmission[];
}): Promise<ActionResult<TaskReviewAttempt>> {
  const parsed = submitTaskReviewSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,

      message: "Invalid quiz submission.",

      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { user } = await requireUser();

    const rateLimitMode =
      process.env.NODE_ENV === "production" ? "fail-closed" : "fail-open";

    const rateLimit = await checkRateLimit({
      key: `task-review-submit:${user.id}`,

      limit: 10,

      window: "10 m",

      mode: rateLimitMode,
    });

    if (!rateLimit.success) {
      return {
        success: false,

        message: rateLimit.message ?? formatRateLimitMessage(rateLimit.reset),
      };
    }

    const response = await fetchAiApi<TaskReviewAttempt>({
      path: "/api/v1/task-reviews/submit",

      timeoutMs: 15_000,

      retries: 1,

      body: {
        user_id: user.id,

        task_id: parsed.data.taskId,

        attempt_id: parsed.data.attemptId,

        answers: parsed.data.answers.map((answer) => ({
          question_id: answer.questionId,

          selected_option_indices: answer.selectedOptionIndices,
        })),
      },
    });

    if (response.status === "passed") {
      scheduleEngagementRecalculation({
        userId: user.id,

        source: "task-review",

        activity: {
          type: "task",

          id: parsed.data.taskId,
        },
      });
    }

    revalidatePath("/workspace");

    return {
      success: true,

      message:
        response.status === "passed" ? "Review passed." : "Review completed.",

      data: response,
    };
  } catch (error) {
    return {
      success: false,

      message:
        error instanceof Error ? error.message : "Failed to submit AI Review.",
    };
  }
}
