"use client";

import { CheckCircle2, XCircle } from "lucide-react";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

import type { TaskReviewAttempt } from "../task-review.types";

type TaskReviewResultProps = {
  attempt: TaskReviewAttempt;
};

export function TaskReviewResult({ attempt }: TaskReviewResultProps) {
  const t = useTranslations("taskReview.result");

  const feedback = attempt.feedback;

  const assessment = attempt.assessment;

  if (!feedback || !assessment) {
    return null;
  }

  const passed = attempt.status === "passed";

  const questionById = new Map(
    assessment.questions.map((question) => [question.id, question]),
  );

  function optionLabels(questionId: string, indices: number[]) {
    const question = questionById.get(questionId);

    if (!question) {
      return "";
    }

    return indices
      .map((index) => question.options[index])
      .filter(Boolean)
      .join(", ");
  }

  return (
    <section className="space-y-5">
      <div className="rounded-[28px] border border-border/60 bg-muted/25 p-6 text-center">
        {passed ? (
          <CheckCircle2 className="mx-auto h-9 w-9 text-primary" />
        ) : (
          <XCircle className="mx-auto h-9 w-9 text-muted-foreground" />
        )}

        <h3 className="mt-4 text-xl font-semibold text-foreground">
          {passed ? t("passedTitle") : t("failedTitle")}
        </h3>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {passed ? t("passedDescription") : t("failedDescription")}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Badge variant="secondary">
            {t("score", {
              score: feedback.score,
            })}
          </Badge>

          <Badge variant="outline">
            {t("threshold", {
              threshold: attempt.pass_threshold,
            })}
          </Badge>

          <Badge variant="outline">
            {t("correct", {
              correct: feedback.correct_count,

              total: feedback.total_questions,
            })}
          </Badge>
        </div>
      </div>

      {!passed ? (
        <div className="rounded-[24px] border border-border/60 p-5">
          <h4 className="font-semibold text-foreground">{t("weakAreas")}</h4>

          {attempt.weak_areas.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {attempt.weak_areas.map((area) => (
                <Badge key={area} variant="secondary">
                  {area}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("noWeakAreas")}
            </p>
          )}
        </div>
      ) : null}

      <div className="space-y-4">
        {feedback.questions.map((item, index) => {
          const question = questionById.get(item.question_id);

          if (!question) {
            return null;
          }

          return (
            <article
              key={item.question_id}
              className="rounded-[24px] border border-border/60 p-5"
            >
              <div className="flex items-start gap-3">
                {item.correct ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                )}

                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t("question", {
                      number: index + 1,
                    })}
                  </p>

                  <p className="mt-2 font-medium leading-7 text-foreground">
                    {question.prompt}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">
                    {t("yourAnswer")}
                  </p>

                  <p className="mt-1 text-foreground">
                    {optionLabels(
                      item.question_id,
                      item.selected_option_indices,
                    )}
                  </p>
                </div>

                <div>
                  <p className="font-medium text-muted-foreground">
                    {t("correctAnswer")}
                  </p>

                  <p className="mt-1 text-foreground">
                    {optionLabels(
                      item.question_id,
                      item.correct_option_indices,
                    )}
                  </p>
                </div>

                <div>
                  <p className="font-medium text-muted-foreground">
                    {t("explanation")}
                  </p>

                  <p className="mt-1 leading-6 text-foreground">
                    {item.explanation}
                  </p>
                </div>

                {item.weak_area ? (
                  <div>
                    <p className="font-medium text-muted-foreground">
                      {t("reviewArea")}
                    </p>

                    <p className="mt-1 text-foreground">{item.weak_area}</p>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
