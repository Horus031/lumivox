"use client";

import { useEffect, useState } from "react";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import type { TaskReviewFlashcard } from "../task-review.types";

type TaskReviewFlashcardsProps = {
  flashcards: TaskReviewFlashcard[];
};

export function TaskReviewFlashcards({
  flashcards,
}: TaskReviewFlashcardsProps) {
  const t = useTranslations("taskReview.flashcards");

  const [index, setIndex] = useState(0);

  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
  }, [flashcards]);

  if (flashcards.length === 0) {
    return null;
  }

  const card = flashcards[index];

  function move(direction: number) {
    setIndex((current) => {
      const next = current + direction;

      if (next < 0) {
        return flashcards.length - 1;
      }

      if (next >= flashcards.length) {
        return 0;
      }

      return next;
    });

    setFlipped(false);
  }

  return (
    <section className="min-w-0 space-y-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-section font-semibold text-foreground">{t("title")}</h3>

          <p className="mt-1 text-sm text-muted-foreground">
            {t("progress", {
              current: index + 1,

              total: flashcards.length,
            })}
          </p>
        </div>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => setFlipped(false)}
          aria-label={t("reset")} title={t("reset")}
        >
          <RotateCcw />

        </Button>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        aria-pressed={flipped}
        aria-label={`${flipped ? t("back") : t("front")}: ${flipped ? card.back : card.front}`}
        title={t("flipHint")}
        className="flex h-52 w-full flex-col items-center justify-center overflow-y-auto rounded-lg border border-border bg-card p-card text-center transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-caption font-medium text-muted-foreground">
          {flipped ? t("back") : t("front")}
        </span>

        <span className="mt-3 min-h-0 overflow-y-auto text-section font-medium text-foreground [overflow-wrap:anywhere]">
          {flipped ? card.back : card.front}
        </span>

      </button>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" size="icon" variant="outline" onClick={() => move(-1)} aria-label={t("previous")} title={t("previous")}>
          <ChevronLeft />

        </Button>

        <Button type="button" size="icon" variant="outline" onClick={() => move(1)} aria-label={t("next")} title={t("next")}>

          <ChevronRight />
        </Button>
      </div>
    </section>
  );
}
