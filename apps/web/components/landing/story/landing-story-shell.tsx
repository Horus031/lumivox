import type { ReactNode } from "react";

import StoryAtmosphere from "./story-atmosphere";

type LandingStoryShellProps = {
  children: ReactNode;
};

export default function LandingStoryShell({
  children,
}: LandingStoryShellProps) {
  return (
    <div className="landing-story relative isolate" data-landing-story>
      <StoryAtmosphere />

      <div className="relative z-10">{children}</div>
    </div>
  );
}
