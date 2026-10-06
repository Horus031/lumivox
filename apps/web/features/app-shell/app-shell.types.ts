export type AppNavigationItem = {
  key:
    | "dashboard"
    | "workspace"
    | "roadmaps"
    | "focus"
    | "rooms"
    | "groups"
    | "leaderboard"
    | "reflections"
    | "settings"
    | "admin";

  href: string;

  adminOnly?: boolean;

  icon:
    | "dashboard"
    | "goals"
    | "tasks"
    | "map"
    | "focus"
    | "rooms"
    | "groups"
    | "leaderboard"
    | "reflections"
    | "settings"
    | "users"
    | "shield";
};
