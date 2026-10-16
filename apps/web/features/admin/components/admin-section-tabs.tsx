"use client";

import {
  Bot,
  BrainCircuit,
  FileText,
  Languages,
  LayoutDashboard,
  Map,
  Settings,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const adminTabs = [
  {
    value: "overview",
    href: "/admin",
    labelKey: "overview",
    icon: LayoutDashboard,
  },
  {
    value: "users",
    href: "/admin/users",
    labelKey: "users",
    icon: Users,
  },
  {
    value: "documents",
    href: "/admin/documents",
    labelKey: "documents",
    icon: FileText,
  },
  {
    value: "groups",
    href: "/admin/groups",
    labelKey: "groups",
    icon: Users,
  },
  {
    value: "ai",
    href: "/admin/ai",
    labelKey: "ai",
    icon: Bot,
  },
  {
    value: "roadmaps",
    href: "/admin/roadmaps",
    labelKey: "roadmaps",
    icon: Map,
  },
  {
    value: "nativeTaskRisk",
    href: "/admin/native-task-risk",
    labelKey: "nativeTaskRisk",
    icon: BrainCircuit,
  },
  {
    value: "translations",
    href: "/admin/ai/translations",
    labelKey: "translations",
    icon: Languages,
  },
  {
    value: "settings",
    href: "/admin/settings",
    labelKey: "settings",
    icon: Settings,
  },
] as const;

function getActiveTab(pathname: string, locale: string) {
  const normalizedPathname = pathname === `/${locale}`
    ? "/"
    : pathname.startsWith(`/${locale}/`)
      ? pathname.slice(locale.length + 1)
      : pathname;

  const activeTab = [...adminTabs]
    .sort((firstTab, secondTab) => secondTab.href.length - firstTab.href.length)
    .find((tab) => {
      return (
        normalizedPathname === tab.href ||
        normalizedPathname.startsWith(`${tab.href}/`)
      );
    });

  return activeTab?.value ?? "overview";
}

export function AdminSectionTabs() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("admin.navigation");
  const activeTab = getActiveTab(pathname, locale);
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const navigation = navigationRef.current;
    const active = navigation?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!navigation || !active) return;
    const relativeLeft = active.getBoundingClientRect().left - navigation.getBoundingClientRect().left;
    if (relativeLeft < 0 || relativeLeft + active.offsetWidth > navigation.clientWidth) {
      navigation.scrollLeft += relativeLeft - (navigation.clientWidth - active.offsetWidth) / 2;
    }
  }, [activeTab]);

  return (
    <nav ref={navigationRef} aria-label={t("label")} className="w-full min-w-0 overflow-x-auto">
      <div className="flex min-w-max gap-1 p-1">
        {adminTabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <Link
              key={tab.value}
              href={tab.href}
              aria-current={activeTab === tab.value ? "page" : undefined}
              className={cn(
                "inline-flex h-touch shrink-0 items-center justify-center gap-2 rounded-md px-3 text-label font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-control",
                activeTab === tab.value ? "bg-secondary text-secondary-foreground" : "text-secondary-text hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-icon shrink-0" aria-hidden="true" />
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
