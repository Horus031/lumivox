import type { ReactNode } from "react";

type StoryRevealProps = {
  children: ReactNode;
  className?: string;
};

export default function StoryReveal({ children, className }: StoryRevealProps) {
  return (
    <div data-landing-motion="decorative" className={className}>
      {children}
    </div>
  );
}
