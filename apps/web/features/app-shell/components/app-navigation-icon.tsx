import type { AppNavigationItem } from "@/features/app-shell/app-shell.types";
import { BookOpenCheck, Goal, LayoutDashboard, Map, MessageSquare, Timer, TrendingUp, Trophy, Users } from "lucide-react";

type AppNavigationIconProps = {
  icon: AppNavigationItem["icon"];
};

export function AppNavigationIcon({ icon }: AppNavigationIconProps) {
  if (icon === "dashboard") {
    return (
      <LayoutDashboard size={"20"}/>
    );
  }

  if (icon === "goals") {
    return (
      <Goal size={"20"}/>
    );
  }

  if (icon === "tasks") {
    return (
      <BookOpenCheck size={"20"}/>
    );
  }

  if (icon === "map") {
    return (
      <Map size={"20"}/>
    );
  }

  if (icon === "focus") {
    return (
      <Timer size={"20"}/>
    );
  }

  if (icon === "rooms") {
    return (
      <Users size={"20"}/>
    );
  }

  if (icon === "groups") {
    return (
      <MessageSquare size={"20"}/>
    );
  }

  if (icon === "leaderboard") {
    return (
      <Trophy size={"20"}/>
    );
  }

  if (icon === "reflections") {
    return (
      <TrendingUp size={"20"}/>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 15a1.8 1.8 0 0 0 .36 1.99l.05.05a2.1 2.1 0 0 1-2.97 2.97l-.05-.05A1.8 1.8 0 0 0 14.8 19.4a1.8 1.8 0 0 0-1.8 1.6V21a2.1 2.1 0 0 1-4.2 0v-.08A1.8 1.8 0 0 0 7 19.4a1.8 1.8 0 0 0-1.99.36l-.05.05a2.1 2.1 0 1 1-2.97-2.97l.05-.05A1.8 1.8 0 0 0 2.6 14.8 1.8 1.8 0 0 0 1 13v-.08a2.1 2.1 0 0 1 0-4.2H1A1.8 1.8 0 0 0 2.6 7a1.8 1.8 0 0 0-.36-1.99l-.05-.05a2.1 2.1 0 1 1 2.97-2.97l.05.05A1.8 1.8 0 0 0 7.2 2.6H7.3A1.8 1.8 0 0 0 9 1h.08a2.1 2.1 0 0 1 4.2 0V1A1.8 1.8 0 0 0 15 2.6a1.8 1.8 0 0 0 1.99-.36l.05-.05a2.1 2.1 0 0 1 2.97 2.97l-.05.05A1.8 1.8 0 0 0 19.4 7c.3.68.93 1.13 1.67 1.2H21a2.1 2.1 0 0 1 0 4.2h-.08A1.8 1.8 0 0 0 19.4 15Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
