"use client";

import type { Profile } from "@/features/profiles/profile.types";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();
  const normalizedPathname = pathname.replace(new RegExp(`^/${locale}`), "") || "/";

  const visibleItems = appNavigationItems.filter((item) => {
    if (item.adminOnly) {
      return profile?.role === "admin";
    }

    return true;
  });

  if (variant === "mobile") {
    return (
      <nav className="grid grid-cols-5 gap-1.5 rounded-3xl bg-sidebar/95 p-2 shadow-[0_18px_55px_-45px_hsl(var(--primary)/0.24)] ring-1 ring-border/70 backdrop-blur-xl">
        {visibleItems.map((item) => {
          const isActive =
            normalizedPathname === item.href ||
            normalizedPathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-14.5 flex-col items-center justify-center rounded-[18px] px-2 text-center transition-all duration-200 ${
                isActive
                  ? "text-primary-foreground shadow-[0_12px_28px_-20px_hsl(var(--primary)/0.65)]"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              <AppNavigationIcon icon={item.icon} />
              <span className="mt-1 text-[11px] font-medium">
                {t(`${item.key}.label`)}
              </span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="space-y-1.5">
      {visibleItems.map((item) => {
        const isActive =
          normalizedPathname === item.href ||
          normalizedPathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            title={t(`${item.key}.label`)}
            href={item.href}
            className={`desktop-sidebar-nav-link group flex items-start gap-3 rounded-[22px] px-3 py-3 transition-all duration-200 ${
              isActive
                ? "text-foreground bg-background shadow-[0_14px_32px_-24px_hsl(var(--primary)/0.72)]"
                : "text-foreground hover:bg-muted/65"
            }`}
          >
            <div className="desktop-sidebar-nav-icon mt-0.5 flex items-center justify-center rounded-2xl p-2">
              <AppNavigationIcon icon={item.icon} />
            </div>

            <div className="desktop-sidebar-link-copy min-w-0 transition-all duration-200">
              <p className="text-sm font-semibold">
                {t(`${item.key}.label`)}
              </p>
              <p
                className={`mt-0.5 text-xs leading-5 ${isActive ? "text-foreground/82" : "text-muted-foreground"}`}
              >
                {t(`${item.key}.description`)}
              </p>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
