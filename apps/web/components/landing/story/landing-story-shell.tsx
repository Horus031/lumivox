import type { ReactNode } from "react";

import StoryAtmosphere from "./story-atmosphere";
import StoryMotionProvider from "./story-motion-provider";

type LandingStoryShellProps = {
  children: ReactNode;
};

export default function LandingStoryShell({
  children,
}: LandingStoryShellProps) {
  return (
    <div className="landing-story relative isolate" data-landing-story>
      <StoryMotionProvider>
        <StoryAtmosphere />

        <div className="relative z-10">{children}</div>
      </StoryMotionProvider>
    </div>
  );
}
