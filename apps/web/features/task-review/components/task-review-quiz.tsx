"use client";

import { useState, useTransition } from "react";

import { useTranslations } from "next-intl";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { Checkbox } from "@/components/ui/checkbox";
import { Send } from "lucide-react";

import { submitTaskReviewAction } from "../task-review.actions";

import type { TaskReviewAttempt } from "../task-review.types";

type TaskReviewQuizProps = {
  attempt: TaskReviewAttempt;

  onSubmitted: (attempt: TaskReviewAttempt) => void;
};

export function TaskReviewQuiz({ attempt, onSubmitted }: TaskReviewQuizProps) {
  const t = useTranslations("taskReview.quiz");

  const [answers, setAnswers] = useState<Record<string, number[]>>({});

  const [isPending, startTransition] = useTransition();

  const assessment = attempt.assessment;

  const questions = assessment?.questions ?? [];

  const answeredCount = questions.filter((question) => (answers[question.id]?.length ?? 0) > 0).length;

  const allAnswered =
    questions.length > 0 && answeredCount === questions.length;

  function selectSingle(questionId: string, optionIndex: number) {
    setAnswers((current) => ({
      ...current,

      [questionId]: [optionIndex],
    }));
  }

  function toggleMultiple(
    questionId: string,
    optionIndex: number,
    checked: boolean,
  ) {
    setAnswers((current) => {
      const previous = current[questionId] ?? [];

      const next = checked
        ? [...previous, optionIndex]
        : previous.filter((value) => value !== optionIndex);

      return {
        ...current,

        [questionId]: Array.from(new Set(next)).sort((a, b) => a - b),
      };
    });
  }

  function handleSubmit() {
    if (!allAnswered || isPending) {
      return;
    }

    startTransition(async () => {
      const result = await submitTaskReviewAction({
        taskId: attempt.task_id,

        attemptId: attempt.attempt_id,

        answers: questions.map((question) => ({
          questionId: question.id,

          selectedOptionIndices: answers[question.id] ?? [],
        })),
      });

      if (!result.success) {
        toast.error(result.message);

        return;
      }

      toast.success(result.message);

      onSubmitted(result.data);
    });
  }

  if (!assessment) {
    return null;
  }

  return (
    <section className="min-w-0 space-y-card">
      <div>
        <h3 className="text-section font-semibold text-foreground">{t("title")}</h3>

        <p className="mt-1 text-body text-muted-foreground">
          {t("description")}
        </p>

        <p className="mt-2 text-caption font-medium text-muted-foreground">
          {t("progress", {
            answered: answeredCount,

            total: questions.length,
          })}
        </p>
      </div>

      <div className="min-w-0 space-y-card">
        {questions.map((question, questionIndex) => {
          const selected = answers[question.id] ?? [];

          const isMultiple = question.kind === "multiple_select";

          return (
            <fieldset disabled={isPending}
              key={question.id}
              className="min-w-0 border-t border-border pt-card"
            >
              <legend className="sr-only">{question.prompt}</legend>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-label font-medium text-muted-foreground">
                  {t("question", {
                    number: questionIndex + 1,
                  })}
                </p>

                <span className="rounded-sm bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground">
                  {t(`kinds.${question.kind}`)}
                </span>
              </div>

              <p className="mt-2 text-body font-medium text-foreground [overflow-wrap:anywhere]">
                {question.prompt}
              </p>

              <div className="mt-4 space-y-2">
                {question.options.map((option, optionIndex) => {
                  const inputId = [
                    "review",
                    attempt.attempt_id,
                    question.id,
                    optionIndex,
                  ].join("-");

                  const checked = selected.includes(optionIndex);

                  if (isMultiple) {
                    return (
                      <label
                        key={inputId}
                        htmlFor={inputId}
                        className={`flex min-h-touch cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition hover:bg-muted/35 ${checked ? "border-primary/40 bg-primary/5" : "border-border"}`}
                      >
                        <Checkbox
                          id={inputId}
                          checked={checked}
                          disabled={isPending}
                          onCheckedChange={(value) =>
                            toggleMultiple(
                              question.id,
                              optionIndex,
                              Boolean(value),
                            )
                          }
                          className="mt-0.5"
                        />

                        <span className="min-w-0 text-body text-foreground [overflow-wrap:anywhere]">
                          {option}
                        </span>
                      </label>
                    );
                  }

                  return (
                    <label
                      key={inputId}
                      htmlFor={inputId}
                      className={`flex min-h-touch cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition hover:bg-muted/35 ${checked ? "border-primary/40 bg-primary/5" : "border-border"}`}
                    >
                      <input
                        id={inputId}
                        type="radio"
                        name={`${attempt.attempt_id}-${question.id}`}
                        checked={checked}
                        disabled={isPending}
                        onChange={() => selectSingle(question.id, optionIndex)}
                        className="mt-1 size-4 shrink-0 accent-primary"
                      />

                      <span className="min-w-0 text-body text-foreground [overflow-wrap:anywhere]">
                        {option}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      {!allAnswered ? (
        <p className="text-sm text-muted-foreground">{t("answerAll")}</p>
      ) : null}

      <Button
        type="button"
        className="w-full"
        disabled={!allAnswered || isPending}
        onClick={handleSubmit}
      >
        <Send aria-hidden="true" />{isPending ? t("submitting") : t("submit")}
      </Button>
    </section>
  );
}
