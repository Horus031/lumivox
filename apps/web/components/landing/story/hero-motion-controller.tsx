"use client";

import { useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useEffect, useRef } from "react";

function resetHeroMotion(root: HTMLElement) {
  root.style.setProperty("--hero-content-y", "0px");
  root.style.setProperty("--hero-content-opacity", "1");
  root.style.setProperty("--hero-video-scale", "1.03");
  root.style.setProperty("--hero-video-y", "0px");
  root.style.setProperty("--hero-signals-opacity", "1");
  root.style.setProperty("--hero-signals-y", "0px");
  root.style.setProperty("--hero-filament-opacity", "1");
}

export default function HeroMotionController() {
  const targetRef = useRef<HTMLDivElement>(null);
  const allowScrubRef = useRef(true);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end start"],
  });

  useEffect(() => {
    const root = targetRef.current?.parentElement;

    if (!root) return;

    if (reduceMotion) {
      resetHeroMotion(root);
    }
  }, [reduceMotion]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");

    const sync = () => {
      allowScrubRef.current = media.matches;

      const root = targetRef.current?.parentElement;

      if (root && !media.matches) {
        resetHeroMotion(root);
      }
    };

    sync();

    media.addEventListener("change", sync);

    return () => {
      media.removeEventListener("change", sync);
    };
  }, []);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (reduceMotion || !allowScrubRef.current) return;

    const root = targetRef.current?.parentElement;

    if (!root) return;

    const progress = Math.min(Math.max(value, 0), 1);

    root.style.setProperty("--hero-content-y", `${progress * -44}px`);

    root.style.setProperty(
      "--hero-content-opacity",
      `${Math.max(0, 1 - progress * 1.35)}`,
    );

    root.style.setProperty("--hero-video-scale", `${1.06 - progress * 0.08}`);

    root.style.setProperty("--hero-video-y", `${progress * -18}px`);

    root.style.setProperty(
      "--hero-signals-opacity",
      `${Math.max(0, 1 - progress * 1.7)}`,
    );

    root.style.setProperty("--hero-signals-y", `${progress * -22}px`);

    root.style.setProperty(
      "--hero-filament-opacity",
      `${Math.min(1, progress * 2.2 + 0.2)}`,
    );
  });

  useEffect(() => {
    if (!reduceMotion) return;

    const root = targetRef.current?.parentElement;
    const video = root?.querySelector<HTMLVideoElement>("[data-hero-video]");

    video?.pause();
  }, [reduceMotion]);

  return (
    <div
      ref={targetRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
    />
  );
}
