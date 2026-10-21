"use client";

import { useCallback, useEffect, useState } from "react";

import { Sparkles } from "lucide-react";

import { useLocale, useTranslations } from "next-intl";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import type { TaskWithGoal } from "@/features/tasks/task.types";

import {
  getLatestTaskReviewAction,
  requestTaskReviewAction,
} from "../task-review.actions";

import type { TaskReviewAttempt } from "../task-review.types";

import { TaskReviewFlashcards } from "./task-review-flashcards";

import { TaskReviewQuiz } from "./task-review-quiz";

import { TaskReviewResult } from "./task-review-result";

type TaskReviewPanelProps = {
  task: TaskWithGoal;

  subtasks: TaskWithGoal[];

  onTaskChanged: () => void;
};

export function TaskReviewPanel({
  task,
  subtasks,
  onTaskChanged,
}: TaskReviewPanelProps) {
  const t = useTranslations("taskReview");

  const locale = useLocale();

  const router = useRouter();

  const [attempt, setAttempt] = useState<TaskReviewAttempt | null>(null);

  const [isLoading, setIsLoading] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);

  const taskId = task.id;

  const preferredLocale: "auto" | "en" | "vi" =
    locale === "vi" ? "vi" : locale === "en" ? "en" : "auto";

  const blockingSubtasks = subtasks.filter(
    (subtask) =>
      subtask.status !== "completed" && subtask.status !== "cancelled",
  );

  const taskCanGenerate =
    task.parent_task_id === null &&
    (task.status === "in_progress" || task.status === "overdue") &&
    blockingSubtasks.length === 0;

  const loadLatest = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await getLatestTaskReviewAction(taskId);

      if (!result.success) {
        toast.error(result.message);

        return;
      }

      setAttempt(result.data);
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  async function handleGenerate() {
    if (!taskCanGenerate || isGenerating) {
      return;
    }

    setIsGenerating(true);

    try {
      const requestId = crypto.randomUUID();

      const result = await requestTaskReviewAction({
        taskId: task.id,

        requestId,

        preferredLocale,

        passThreshold: 70,
      });

      if (!result.success) {
        toast.error(result.message);

        await loadLatest();

        return;
      }

      setAttempt(result.data);

      toast.success(result.message);

      onTaskChanged();

      router.refresh();
    } finally {
      setIsGenerating(false);
    }
  }

  useEffect(() => {
    if (attempt?.status !== "generating") {
      return;
    }

    const interval = window.setInterval(() => {
      void loadLatest();
    }, 4_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [attempt?.status, attempt?.attempt_id, loadLatest]);

  function handleSubmitted(submittedAttempt: TaskReviewAttempt) {
    setAttempt(submittedAttempt);

    onTaskChanged();

    router.refresh();
  }

  function sourceLabel(reviewAttempt: TaskReviewAttempt) {
    if (reviewAttempt.source.mode === "document_grounded") {
      return t("source.documentGrounded", {
        documents: reviewAttempt.source.document_count,

        chunks: reviewAttempt.source.retrieved_chunk_count,
      });
    }

    return t("source.topicInferred");
  }

  if (isLoading && !attempt) {
    return (
      <div className="rounded-[24px] border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
        {t("loading")}
      </div>
    );
  }

  if (attempt?.status === "generating") {
    return (
      <div className="rounded-[24px] border border-border/60 bg-muted/25 p-6">
        <Sparkles className="h-5 w-5 text-primary" />

        <h3 className="mt-3 font-semibold text-foreground">
          {t("generatingTitle")}
        </h3>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("generatingDescription")}
        </p>

        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => void loadLatest()}
        >
          {t("refresh")}
        </Button>
      </div>
    );
  }

  if (attempt?.status === "ready" && attempt.assessment) {
    return (
      <div className="space-y-7">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {t("attempt", {
                number: attempt.attempt_number,
              })}
            </Badge>

            <Badge variant="outline">
              {t("threshold", {
                value: attempt.pass_threshold,
              })}
            </Badge>
          </div>

          <h3 className="mt-4 text-lg font-semibold text-foreground">
            {attempt.assessment.title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {attempt.assessment.summary}
          </p>

          <p className="mt-3 rounded-2xl bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
            {sourceLabel(attempt)}
          </p>
        </div>

        <TaskReviewFlashcards flashcards={attempt.assessment.flashcards} />

        <TaskReviewQuiz attempt={attempt} onSubmitted={handleSubmitted} />
      </div>
    );
  }

  if (attempt?.status === "passed" || attempt?.status === "failed") {
    return (
      <div className="space-y-7">
        <p className="rounded-2xl bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
          {sourceLabel(attempt)}
        </p>

        {attempt.assessment ? (
          <TaskReviewFlashcards flashcards={attempt.assessment.flashcards} />
        ) : null}

        <TaskReviewResult attempt={attempt} />

        {attempt.status === "failed" && taskCanGenerate ? (
          <div className="rounded-[24px] border border-border/60 p-5">
            <h3 className="font-semibold text-foreground">{t("retryTitle")}</h3>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("retryDescription")}
            </p>

            <Button
              type="button"
              className="mt-4"
              disabled={isGenerating}
              onClick={handleGenerate}
            >
              <Sparkles />

              {isGenerating ? t("generating") : t("generateAgain")}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (
    attempt?.status === "generation_failed" ||
    attempt?.status === "cancelled"
  ) {
    return (
      <div className="rounded-[24px] border border-border/60 p-6">
        <h3 className="font-semibold text-foreground">
          {t("generationFailedTitle")}
        </h3>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {attempt.generation_error || t("generationFailedDescription")}
        </p>

        {taskCanGenerate ? (
          <Button
            type="button"
            className="mt-4"
            disabled={isGenerating}
            onClick={handleGenerate}
          >
            <Sparkles />

            {isGenerating ? t("generating") : t("retryGeneration")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (task.parent_task_id !== null) {
    return (
      <div className="rounded-[24px] border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
        {t("subtaskUnavailable")}
      </div>
    );
  }

  if (blockingSubtasks.length > 0) {
    return (
      <div className="rounded-[24px] border border-border/60 p-6">
        <h3 className="font-semibold text-foreground">{t("blockedTitle")}</h3>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("blockedDescription", {
            count: blockingSubtasks.length,
          })}
        </p>
      </div>
    );
  }

  if (task.status === "todo") {
    return (
      <div className="rounded-[24px] border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
        {t("startTaskFirst")}
      </div>
    );
  }

  if (task.status === "in_review") {
    return (
      <div className="rounded-[24px] border border-border/60 p-6">
        <p className="text-sm text-muted-foreground">{t("missingAttempt")}</p>

        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => void loadLatest()}
        >
          {t("refresh")}
        </Button>
      </div>
    );
  }

  if (task.status === "completed" || task.status === "cancelled") {
    return (
      <div className="rounded-[24px] border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
        {t("closedWithoutReview")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-foreground">{t("generateTitle")}</h3>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("generateDescription")}
        </p>
      </div>

      <Button
        type="button"
        disabled={!taskCanGenerate || isGenerating}
        onClick={handleGenerate}
      >
        <Sparkles />

        {isGenerating ? t("generating") : t("generate")}
      </Button>
    </div>
  );
}
