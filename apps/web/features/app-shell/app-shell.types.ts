export type AppNavigationItem = {
  key:
    | "dashboard"
    | "goals"
    | "tasks"
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
    | "focus"
    | "rooms"
    | "reflections"
    | "settings"
    | "users"
    | "shield";
};
