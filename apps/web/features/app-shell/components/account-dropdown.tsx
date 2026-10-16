"use client";

import { LogOut, Settings, Shield } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Profile } from "@/features/profiles/profile.types";
import { Link } from "@/i18n/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type AccountDropdownProps = {
  profile: Profile;
  align?: "start" | "center" | "end";
  compact?: boolean;
};

function getInitials(name: string | null) {
  if (!name) return "LU";

  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export function AccountDropdown({
  profile,
  align = "end",
  compact = false,
}: AccountDropdownProps) {
  const sidebarT = useTranslations("appShell.sidebar");
  const navigationT = useTranslations("appShell.navigation");

  const displayName = profile.full_name ?? sidebarT("fallbackUser");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${sidebarT("account")}: ${displayName}`}
          title={displayName}
          className={cn(
            "flex h-control items-center gap-2 rounded-md px-2 text-left text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact && "size-touch justify-center px-0",
          )}
        >
          <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-caption font-semibold text-foreground">
            {getInitials(profile.full_name)}
          </span>
          {!compact ? (
            <span className="hidden min-w-0 sm:block">
              <span className="block max-w-40 truncate text-label font-medium text-foreground">
                {displayName}
              </span>
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        className="w-60 max-w-[calc(100vw-1rem)] rounded-lg border-border p-1 shadow-md"
      >
        <DropdownMenuLabel className="px-3 py-2">
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">
              {getInitials(profile.full_name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {displayName}
              </span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {profile.timezone}
              </span>
            </span>
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild className="min-h-touch cursor-pointer rounded-md px-3 py-2 lg:min-h-control">
          <Link href="/settings">
            <Settings />
            {navigationT("settings.label")}
          </Link>
        </DropdownMenuItem>

        {profile.role === "admin" ? (
          <DropdownMenuItem
            asChild
            className="min-h-touch cursor-pointer rounded-md px-3 py-2 lg:min-h-control"
          >
            <Link href="/admin">
              <Shield />
              {navigationT("admin.label")}
            </Link>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <form action="/auth/signout" method="post">
          <DropdownMenuItem
            asChild
            className="min-h-touch cursor-pointer rounded-md px-3 py-2 lg:min-h-control"
            // Keep the form mounted until the browser submits it.
            onSelect={(event) => event.preventDefault()}
          >
            <button type="submit" className="w-full">
              <LogOut />
              {sidebarT("signOut")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
