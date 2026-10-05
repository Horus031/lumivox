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
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{t("title")}</h3>

          <p className="mt-1 text-sm text-muted-foreground">
            {t("progress", {
              current: index + 1,

              total: flashcards.length,
            })}
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setFlipped(false)}
        >
          <RotateCcw />

          {t("reset")}
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        className="flex min-h-56 w-full flex-col items-center justify-center rounded-[28px] border border-border/70 bg-muted/25 p-7 text-center transition hover:bg-muted/40"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          {flipped ? t("back") : t("front")}
        </span>

        <span className="mt-5 text-lg font-semibold leading-8 text-foreground">
          {flipped ? card.back : card.front}
        </span>

        <span className="mt-6 text-xs text-muted-foreground">
          {t("flipHint")}
        </span>
      </button>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => move(-1)}>
          <ChevronLeft />

          {t("previous")}
        </Button>

        <Button type="button" variant="outline" onClick={() => move(1)}>
          {t("next")}

          <ChevronRight />
        </Button>
      </div>
    </section>
  );
}
