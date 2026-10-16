"use client";

import { useCallback, useEffect, useState } from "react";

import { RefreshCw, Sparkles } from "lucide-react";

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
      <div className="border-y border-border py-card text-body text-muted-foreground">
        {t("loading")}
      </div>
    );
  }

  if (attempt?.status === "generating") {
    return (
      <div className="border-y border-border py-card">
        <Sparkles className="h-5 w-5 text-primary" />

        <h3 className="mt-3 text-section font-semibold text-foreground">
          {t("generatingTitle")}
        </h3>

        <p className="mt-2 text-body text-secondary-text">
          {t("generatingDescription")}
        </p>

        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => void loadLatest()}
        >
          <RefreshCw aria-hidden="true" />{t("refresh")}
        </Button>
      </div>
    );
  }

  if (attempt?.status === "ready" && attempt.assessment) {
    return (
      <div className="min-w-0 space-y-section">
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

          <h3 className="mt-4 text-section font-semibold text-foreground [overflow-wrap:anywhere]">
            {attempt.assessment.title}
          </h3>

          <p className="mt-2 text-body text-secondary-text">
            {attempt.assessment.summary}
          </p>

          <p className="mt-3 text-caption text-muted-foreground">
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
      <div className="min-w-0 space-y-section">
        <p className="text-caption text-muted-foreground">
          {sourceLabel(attempt)}
        </p>

        {attempt.assessment ? (
          <TaskReviewFlashcards flashcards={attempt.assessment.flashcards} />
        ) : null}

        <TaskReviewResult attempt={attempt} />

        {attempt.status === "failed" && taskCanGenerate ? (
          <div className="border-t border-border pt-card">
            <h3 className="text-section font-semibold text-foreground">{t("retryTitle")}</h3>

            <p className="mt-2 text-body text-secondary-text">
              {t("retryDescription")}
            </p>

            <Button
              type="button"
              className="mt-4"
              disabled={isGenerating}
              onClick={handleGenerate}
            >
              <Sparkles aria-hidden="true" />

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
      <div className="border-y border-border py-card">
        <h3 className="text-section font-semibold text-foreground">
          {t("generationFailedTitle")}
        </h3>

        <p className="mt-2 text-body text-secondary-text">
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
      <div className="border-y border-border py-card text-body text-muted-foreground">
        {t("subtaskUnavailable")}
      </div>
    );
  }

  if (blockingSubtasks.length > 0) {
    return (
      <div className="border-y border-border py-card">
        <h3 className="text-section font-semibold text-foreground">{t("blockedTitle")}</h3>

        <p className="mt-2 text-body text-secondary-text">
          {t("blockedDescription", {
            count: blockingSubtasks.length,
          })}
        </p>
      </div>
    );
  }

  if (task.status === "todo") {
    return (
      <div className="border-y border-border py-card text-body text-muted-foreground">
        {t("startTaskFirst")}
      </div>
    );
  }

  if (task.status === "in_review") {
    return (
      <div className="border-y border-border py-card">
        <p className="text-body text-muted-foreground">{t("missingAttempt")}</p>

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
      <div className="border-y border-border py-card text-body text-muted-foreground">
        {t("closedWithoutReview")}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-card">
      <div>
        <h3 className="text-section font-semibold text-foreground">{t("generateTitle")}</h3>

        <p className="mt-2 text-body text-secondary-text">
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
