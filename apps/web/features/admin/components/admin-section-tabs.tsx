"use client";

import {
  Bot,
  FileText,
  Languages,
  LayoutDashboard,
  Map,
  Settings,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import { Link } from "@/i18n/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const normalizedPathname =
    pathname.replace(new RegExp(`^/${locale}`), "") || "/";

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
  const t = useTranslations("admin.dashboard.actions");

  return (
    <Tabs value={getActiveTab(pathname, locale)} className="gap-0">
      <div className="overflow-x-auto pb-1">
        <TabsList
          variant="line"
          className="min-w-max rounded-xl border border-border/70 bg-surface/90 p-1 shadow-sm backdrop-blur"
        >
          {adminTabs.map((tab) => {
            const Icon = tab.icon;

            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                asChild
                className="rounded-lg h-fit px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Link href={tab.href}>
                  <Icon />
                  {t(tab.labelKey)}
                </Link>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
    </Tabs>
  );
}
