"use client";

import type { Profile } from "@/features/profiles/profile.types";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { appNavigationItems } from "@/features/app-shell/app-navigation.config";
import { AppNavigationIcon } from "@/features/app-shell/components/app-navigation-icon";

type AppNavigationProps = {
  variant?: "desktop" | "mobile";
  profile?: Profile;
};

export function AppNavigation({
  variant = "desktop",
  profile,
}: AppNavigationProps) {
  const locale = useLocale();
  const t = useTranslations("appShell.navigation");
  const shellT = useTranslations("appShell.sidebar");
  const pathname = usePathname();
  const normalizedPathname = pathname.replace(new RegExp(`^/${locale}`), "") || "/";

  const visibleItems = appNavigationItems.filter((item) => {
    if (item.adminOnly) {
      return profile?.role === "admin";
    }

    return true;
  });

  if (variant === "mobile") {
    const primaryItems = visibleItems.slice(0, 4);
    const moreItems = visibleItems.slice(4);
    const isMoreActive = moreItems.some((item) =>
      normalizedPathname === item.href || normalizedPathname.startsWith(`${item.href}/`),
    );
    return (
      <nav aria-label={shellT("title")} className="grid grid-cols-5 gap-1 bg-sidebar px-2 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]">
        {primaryItems.map((item) => {
          const isActive =
            normalizedPathname === item.href ||
            normalizedPathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              aria-label={t(`${item.key}.label`)}
              className={`flex h-topbar min-w-0 flex-col items-center justify-center gap-1 rounded-md px-0.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <AppNavigationIcon icon={item.icon} />
              <span className="max-w-full text-caption font-medium break-words">
                {t(`${item.key}.${item.key === "workspace" || item.key === "dashboard" ? "mobileLabel" : "label"}`)}
              </span>
            </Link>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn("flex h-topbar min-w-0 flex-col items-center justify-center gap-1 rounded-md text-caption font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", isMoreActive && "bg-muted text-foreground")}>
              <Ellipsis className="size-icon-lg" aria-hidden="true" />
              {t("more")}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-56 max-w-[calc(100vw-1rem)] rounded-lg">
            {moreItems.map((item) => {
              const isActive = normalizedPathname === item.href || normalizedPathname.startsWith(`${item.href}/`);
              return (
                <DropdownMenuItem key={item.href} asChild className="min-h-touch rounded-md text-body focus:bg-muted focus:text-foreground">
                  <Link href={item.href} aria-current={isActive ? "page" : undefined} className={cn(isActive && "bg-muted font-medium")}>
                    <AppNavigationIcon icon={item.icon} />
                    {t(`${item.key}.label`)}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    );
  }

  return (
    <nav aria-label={shellT("title")} className="space-y-1">
      {visibleItems.map((item) => {
        const isActive =
          normalizedPathname === item.href ||
          normalizedPathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            title={t(`${item.key}.label`)}
            aria-label={t(`${item.key}.label`)}
            aria-current={isActive ? "page" : undefined}
            href={item.href}
            className={`desktop-sidebar-nav-link group flex min-h-control items-center gap-3 rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              isActive
                ? "bg-muted text-foreground"
                : "text-secondary-text hover:bg-muted hover:text-foreground"
            }`}
          >
            <div aria-hidden="true" className="desktop-sidebar-nav-icon flex size-icon-lg shrink-0 items-center justify-center">
              <AppNavigationIcon icon={item.icon} />
            </div>

            <div className="desktop-sidebar-link-copy min-w-0">
              <p className="text-label font-medium">
                {t(`${item.key}.label`)}
              </p>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
