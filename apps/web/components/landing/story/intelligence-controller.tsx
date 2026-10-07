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

    const activate = (feature: string) => {
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
        const active = entries.find((entry) => entry.isIntersecting);

        if (!active) return;

        const feature = (active.target as HTMLElement).dataset
          .intelligenceFeature;

        if (feature) activate(feature);
      },
      {
        rootMargin: "-38% 0px -42% 0px",
        threshold: 0,
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
