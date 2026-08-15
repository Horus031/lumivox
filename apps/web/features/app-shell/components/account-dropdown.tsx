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
          className={cn(
            "flex items-center gap-3 rounded-full bg-surface p-1.5 pr-3 text-left shadow-sm transition hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact && "pr-1.5",
          )}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">
            {getInitials(profile.full_name)}
          </span>
          {!compact ? (
            <span className="hidden min-w-0 sm:block">
              <span className="block max-w-42 truncate text-sm font-semibold text-foreground">
                {displayName}
              </span>
              <span className="block max-w-42 truncate text-xs text-muted-foreground">
                {profile.timezone}
              </span>
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        className="w-64 rounded-xl border-border/70 p-2 shadow-[0_18px_50px_-32px_hsl(var(--primary)/0.35)]"
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

        <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-3 py-2">
          <Link href="/settings">
            <Settings />
            {navigationT("settings.label")}
          </Link>
        </DropdownMenuItem>

        {profile.role === "admin" ? (
          <DropdownMenuItem
            asChild
            className="cursor-pointer rounded-lg px-3 py-2"
          >
            <Link href="/admin">
              <Shield />
              {navigationT("admin.label")}
            </Link>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <form action="/auth/signout" method="post">
          <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-3 py-2">
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
