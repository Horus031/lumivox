export type AppNavigationItem = {
  label: string;
  href: string;
  description: string;
  icon:
    | "dashboard"
    | "goals"
    | "tasks"
    | "focus"
    | "rooms"
    | "reflections"
    | "settings";
};
