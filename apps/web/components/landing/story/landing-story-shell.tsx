import type { ReactNode } from "react";

import StoryAtmosphere from "./story-atmosphere";

type LandingStoryShellProps = {
  children: ReactNode;
};

export default function LandingStoryShell({
  children,
}: LandingStoryShellProps) {
  return (
    <div className="landing-story" data-landing-story>
      <StoryAtmosphere />
      {children}
    </div>
  );
}