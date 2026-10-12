import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Keep caller overrides working with the application tokens in globals.css.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["caption", "label", "body", "section", "page", "metric"],
      spacing: [
        "control-sm", "control", "control-lg", "touch", "card", "section",
        "page", "sidebar", "topbar", "icon-sm", "icon", "icon-lg",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
