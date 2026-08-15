import type { AppNavigationItem } from "./app-shell.types";

export const appNavigationItems: AppNavigationItem[] = [
  {
    key: "dashboard",
    href: "/dashboard",
    icon: "dashboard",
  },
  {
    key: "goals",
    href: "/goals",
    icon: "goals",
  },
  {
    key: "tasks",
    href: "/tasks",
    icon: "tasks",
  },
  {
    key: "focus",
    href: "/focus",
    icon: "focus",
  },
  {
    key: "rooms",
    href: "/rooms",
    icon: "rooms",
  },
  {
    key: "groups",
    href: "/groups",
    icon: "users",
  },
  {
    key: "leaderboard",
    href: "/leaderboard",
    icon: "users",
  },
  {
    key: "reflections",
    href: "/reflections",
    icon: "reflections",
  },

  {
    key: "settings",
    href: "/settings",
    icon: "settings",
  },
  {
    key: "admin",
    href: "/admin",
    icon: "shield",
    adminOnly: true,
  },
];
