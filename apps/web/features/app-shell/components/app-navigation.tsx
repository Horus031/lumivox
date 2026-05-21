"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { appNavigationItems } from "@/features/app-shell/app-navigation.config";
import { AppNavigationIcon } from "@/features/app-shell/components/app-navigation-icon";

type AppNavigationProps = {
  variant?: "desktop" | "mobile";
};

export function AppNavigation({ variant = "desktop" }: AppNavigationProps) {
  const pathname = usePathname();

  if (variant === "mobile") {
    return (
      <nav className="grid grid-cols-5 gap-1.5 rounded-3xl bg-sidebar/95 p-2 shadow-[0_18px_55px_-45px_hsl(var(--primary)/0.24)] ring-1 ring-border/70 backdrop-blur-xl">
        {appNavigationItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

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
              <span className="mt-1 text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="space-y-1.5">
      {appNavigationItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`group flex items-start gap-3 rounded-[22px] px-3 py-3 transition-all duration-200 ${
              isActive
                ? "bg-linear-to-r from-primary to-primary-glow text-primary-foreground shadow-[0_14px_32px_-24px_hsl(var(--primary)/0.72)]"
                : "text-foreground hover:bg-muted/65"
            }`}
          >
            <div
              className={`mt-0.5 rounded-2xl p-2 ${
                isActive
                  ? "bg-white/14"
                  : "bg-sidebar-accent/80 group-hover:bg-sidebar-accent"
              }`}
            >
              <AppNavigationIcon icon={item.icon} />
            </div>

            <div>
              <p className="text-sm font-semibold">{item.label}</p>
              <p
                className={`mt-0.5 text-xs leading-5 ${isActive ? "text-primary-foreground/82" : "text-muted-foreground"}`}
              >
                {item.description}
              </p>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
