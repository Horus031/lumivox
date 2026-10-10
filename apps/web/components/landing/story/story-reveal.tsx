"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

type StoryRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
  once?: boolean;
};

export default function StoryReveal({
  children,
  className,
}: StoryRevealProps) {
  return (
    <motion.div
      data-landing-motion="decorative"
      className={className}
      initial={false}
    >
      {children}
    </motion.div>
  );
}
