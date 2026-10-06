import { getLocale } from "next-intl/server";

import { redirect } from "next/navigation";

import { buildLegacyTaskWorkspaceUrl } from "@/features/workspace/workspace-legacy-redirect";

type TasksPageProps = {
  searchParams: Promise<{
    goalId?: string;
    taskId?: string;
    parentTaskId?: string;
    action?: string;
  }>;
};

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const [locale, params] = await Promise.all([getLocale(), searchParams]);

  const target = buildLegacyTaskWorkspaceUrl(params);

  redirect(`/${locale}${target}`);
}
