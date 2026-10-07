"use client";

import { useEffect, useRef } from "react";

export default function ProductShowcaseController() {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = anchorRef.current?.closest<HTMLElement>(
      "[data-product-story]",
    );

    if (!root) return;

    const chapters = Array.from(
      root.querySelectorAll<HTMLElement>("[data-product-chapter]"),
    );

    const visuals = Array.from(
      root.querySelectorAll<HTMLElement>("[data-product-visual]"),
    );

    const visible = new Map<Element, number>();

    const activate = (product: string) => {
      if (root.dataset.activeProduct === product) return;

      root.dataset.activeProduct = product;

      chapters.forEach((chapter) => {
        chapter.toggleAttribute(
          "data-active",
          chapter.dataset.productChapter === product,
        );
      });

      visuals.forEach((visual) => {
        const isActive = visual.dataset.productVisual === product;

        visual.toggleAttribute("data-active", isActive);
        visual.setAttribute("aria-hidden", String(!isActive));
      });

      window.dispatchEvent(
        new CustomEvent("landing:product-change", {
          detail: { product },
        }),
      );
    };

    const first = chapters[0]?.dataset.productChapter;

    if (first) activate(first);

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

        const product = active?.dataset.productChapter;

        if (product) activate(product);
      },
      {
        rootMargin: "-34% 0px -38% 0px",
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
