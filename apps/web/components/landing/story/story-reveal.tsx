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
  delay = 0,
  distance = 24,
  once = true,
}: StoryRevealProps) {
  return (
    <motion.div
      data-landing-motion="decorative"
      className={className}
      initial={{
        opacity: 0,
        y: distance,
      }}
      whileInView={{
        opacity: 1,
        y: 0,
      }}
      viewport={{
        once,
        amount: 0.2,
        margin: "0px 0px -8% 0px",
      }}
      transition={{
        duration: 0.72,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
