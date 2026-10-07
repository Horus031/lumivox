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

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visibleEntry) return;

        const scene = (visibleEntry.target as HTMLElement).dataset.landingScene;

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
