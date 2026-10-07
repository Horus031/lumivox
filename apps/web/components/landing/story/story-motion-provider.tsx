"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

type StoryMotionProviderProps = {
  children: ReactNode;
};

export default function StoryMotionProvider({
  children,
}: StoryMotionProviderProps) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  );
}