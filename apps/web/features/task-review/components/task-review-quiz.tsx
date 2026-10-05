"use client";

import { useMemo, useState, useTransition } from "react";

import { useTranslations } from "next-intl";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { Checkbox } from "@/components/ui/checkbox";

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

  const answeredCount = useMemo(
    () =>
      questions.filter((question) => (answers[question.id]?.length ?? 0) > 0)
        .length,
    [answers, questions],
  );

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
    <section className="space-y-5">
      <div>
        <h3 className="font-semibold text-foreground">{t("title")}</h3>

        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {t("description")}
        </p>

        <p className="mt-2 text-xs font-medium text-muted-foreground">
          {t("progress", {
            answered: answeredCount,

            total: questions.length,
          })}
        </p>
      </div>

      <div className="space-y-5">
        {questions.map((question, questionIndex) => {
          const selected = answers[question.id] ?? [];

          const isMultiple = question.kind === "multiple_select";

          return (
            <article
              key={question.id}
              className="rounded-[24px] border border-border/60 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  {t("question", {
                    number: questionIndex + 1,
                  })}
                </p>

                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  {t(`kinds.${question.kind}`)}
                </span>
              </div>

              <p className="mt-3 font-medium leading-7 text-foreground">
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
                        className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/50 px-4 py-3 transition hover:bg-muted/35"
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

                        <span className="text-sm leading-6 text-foreground">
                          {option}
                        </span>
                      </label>
                    );
                  }

                  return (
                    <label
                      key={inputId}
                      htmlFor={inputId}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/50 px-4 py-3 transition hover:bg-muted/35"
                    >
                      <input
                        id={inputId}
                        type="radio"
                        name={question.id}
                        checked={checked}
                        disabled={isPending}
                        onChange={() => selectSingle(question.id, optionIndex)}
                        className="mt-1 h-4 w-4"
                      />

                      <span className="text-sm leading-6 text-foreground">
                        {option}
                      </span>
                    </label>
                  );
                })}
              </div>
            </article>
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
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </section>
  );
}
