"use client";

import { useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useEffect, useRef } from "react";

export default function LearningJourneyController() {
  const trackRef = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start end", "end start"],
  });

  useEffect(() => {
    const root = trackRef.current?.closest<HTMLElement>(
      "[data-learning-journey]",
    );

    if (!root) return;

    const chapters = Array.from(
      root.querySelectorAll<HTMLElement>("[data-journey-step]"),
    );

    const visible = new Map<Element, number>();

    const activate = (step: string) => {
      if (root.dataset.activeStep === step) return;

      root.dataset.activeStep = step;

      chapters.forEach((chapter) => {
        chapter.toggleAttribute(
          "data-active",
          chapter.dataset.journeyStep === step,
        );
      });

      window.dispatchEvent(
        new CustomEvent("landing:journey-change", {
          detail: { step },
        }),
      );
    };

    const firstStep = chapters[0]?.dataset.journeyStep;

    if (firstStep) activate(firstStep);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visible.set(entry.target, entry.intersectionRatio);
          } else {
            visible.delete(entry.target);
          }
        });

        const active = [...visible.entries()].sort(
          (a, b) =>
            b[1] - a[1] ||
            chapters.indexOf(a[0] as HTMLElement) -
              chapters.indexOf(b[0] as HTMLElement),
        )[0]?.[0] as HTMLElement | undefined;

        const step = active?.dataset.journeyStep;

        if (step) activate(step);
      },
      {
        rootMargin: "-35% 0px -35% 0px",
        threshold: [0, 0.25, 0.5, 0.75],
      },
    );

    chapters.forEach((chapter) => observer.observe(chapter));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = trackRef.current?.closest<HTMLElement>(
      "[data-learning-journey]",
    );

    root?.style.setProperty(
      "--journey-progress",
      reduceMotion ? "1" : String(scrollYProgress.get()),
    );
  }, [reduceMotion, scrollYProgress]);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (reduceMotion) return;

    const root = trackRef.current?.closest<HTMLElement>(
      "[data-learning-journey]",
    );

    if (!root) return;

    root.style.setProperty(
      "--journey-progress",
      String(Math.min(Math.max(value, 0), 1)),
    );
  });

  return (
    <span
      ref={trackRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
    />
  );
}
