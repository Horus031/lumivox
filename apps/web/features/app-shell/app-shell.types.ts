export type AppNavigationItem = {
  key:
    | "dashboard"
    | "goals"
    | "tasks"
    | "roadmaps"
    | "focus"
    | "rooms"
    | "groups"
    | "leaderboard"
    | "reflections"
    | "settings"
    | "admin"
    | "workspace";
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
