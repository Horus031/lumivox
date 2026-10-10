"use client";

import { useEffect, useRef } from "react";

export default function IntelligenceController() {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = anchorRef.current?.closest<HTMLElement>(
      "[data-intelligence-system]",
    );

    if (!root) return;

    const chapters = Array.from(
      root.querySelectorAll<HTMLElement>("[data-intelligence-feature]"),
    );

    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>("[data-intelligence-node]"),
    );

    const visible = new Map<Element, number>();

    const activate = (feature: string) => {
      if (root.dataset.activeFeature === feature) return;

      root.dataset.activeFeature = feature;

      chapters.forEach((chapter) => {
        chapter.toggleAttribute(
          "data-active",
          chapter.dataset.intelligenceFeature === feature,
        );
      });

      nodes.forEach((node) => {
        node.toggleAttribute(
          "data-active",
          node.dataset.intelligenceNode === feature,
        );
      });

      window.dispatchEvent(
        new CustomEvent("landing:intelligence-change", {
          detail: { feature },
        }),
      );
    };

    if (chapters[0]?.dataset.intelligenceFeature) {
      activate(chapters[0].dataset.intelligenceFeature);
    }

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

        const feature = active?.dataset.intelligenceFeature;

        if (feature) activate(feature);
      },
      {
        rootMargin: "-38% 0px -42% 0px",
        threshold: [0, 0.25, 0.5, 0.75],
      },
    );

    chapters.forEach((chapter) => observer.observe(chapter));

    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={anchorRef}
      aria-hidden="true"
      className="pointer-events-none absolute size-px opacity-0"
    />
  );
}
