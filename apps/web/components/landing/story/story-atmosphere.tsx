"use client";

import { useEffect, useState } from "react";

import {
  initialLandingScene,
  landingSceneIds,
  type LandingSceneId,
} from "./story-scenes";

function isLandingScene(value: string | undefined): value is LandingSceneId {
  return (
    typeof value === "string" &&
    landingSceneIds.includes(value as LandingSceneId)
  );
}

export default function StoryAtmosphere() {
  const [activeScene, setActiveScene] =
    useState<LandingSceneId>(initialLandingScene);

  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-landing-scene]"),
    );

    if (!sections.length) return;

    const visible = new Map<Element, number>();

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
            sections.indexOf(a[0] as HTMLElement) -
              sections.indexOf(b[0] as HTMLElement),
        )[0]?.[0] as HTMLElement | undefined;

        const scene = active?.dataset.landingScene;

        if (!isLandingScene(scene)) return;

        setActiveScene((currentScene) => {
          if (currentScene === scene) return currentScene;

          window.dispatchEvent(
            new CustomEvent("landing:scene-change", {
              detail: { scene },
            }),
          );

          return scene;
        });
      },
      {
        rootMargin: "-20% 0px -35% 0px",
        threshold: [0.1, 0.25, 0.5, 0.75],
      },
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-hidden="true"
      data-landing-atmosphere
      data-active-scene={activeScene}
      className="story-atmosphere pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="story-atmosphere__base" />

      <div
        data-landing-motion="decorative"
        className="story-atmosphere__orb story-atmosphere__orb--primary"
      />

      <div
        data-landing-motion="decorative"
        className="story-atmosphere__orb story-atmosphere__orb--secondary"
      />

      <div
        data-landing-motion="decorative"
        className="story-atmosphere__constellation"
      />

      <div className="story-atmosphere__grid" />

      <div className="story-atmosphere__vignette" />
    </div>
  );
}
