import type { AppNavigationItem } from "./app-shell.types";

export const appNavigationItems: AppNavigationItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    description: "Behaviour analytics and insights",
    icon: "dashboard",
  },
  {
    label: "Goals",
    href: "/goals",
    description: "Learning objectives",
    icon: "goals",
  },
  {
    label: "Tasks",
    href: "/tasks",
    description: "Actionable work items",
    icon: "tasks",
  },
  {
    label: "Focus",
    href: "/focus",
    description: "Focus sessions and distractions",
    icon: "focus",
  },
  {
    label: "Rooms",
    href: "/rooms",
    description: "Collaborative study spaces",
    icon: "rooms",
  },
  {
    label: "Reflections",
    href: "/reflections",
    description: "Weekly Behaviour Reflection",
    icon: "reflections",
  },

  {
    label: "Settings",
    href: "/settings",
    description: "Profile and PBI calibration",
    icon: "settings",
  },
];
