import type { AppNavigationItem } from "@/features/app-shell/app-shell.types";

type AppNavigationIconProps = {
  icon: AppNavigationItem["icon"];
};

export function AppNavigationIcon({ icon }: AppNavigationIconProps) {
  if (icon === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M4 4h6v6H4V4Zm10 0h6v10h-6V4ZM4 14h6v6H4v-6Zm10 4h6v2h-6v-2Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (icon === "goals") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 4v8l5-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "tasks") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M7 6h13M7 12h13M7 18h13M4 6h.01M4 12h.01M4 18h.01"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "focus") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <circle cx="12" cy="13" r="7" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 13V9M9 3h6M16.5 5.5l1.5-1.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "rooms") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4M12 19c0-1.8 1.6-3.3 4-3.3s4 1.5 4 3.3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (icon === "reflections") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4M12 19c0-1.8 1.6-3.3 4-3.3s4 1.5 4 3.3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
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
