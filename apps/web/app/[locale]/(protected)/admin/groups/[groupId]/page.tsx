import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { AdminMetricCard } from "@/features/admin/components/admin-metric-card";
import { AdminGroupArchiveButton } from "@/features/admin/components/admin-group-archive-button";
import { AdminGroupMembersTable } from "@/features/admin/components/admin-group-members-table";
import { AdminGroupMessagesTable } from "@/features/admin/components/admin-group-messages-table";
import {
  getAdminStudyGroupDetail,
  getAdminStudyGroupMembers,
  getAdminStudyGroupMessages,
} from "@/features/admin/admin-groups.queries";

type AdminGroupDetailPageProps = {
  params: Promise<{
    groupId: string;
  }>;
};

export default async function AdminGroupDetailPage({
  params,
}: AdminGroupDetailPageProps) {
  const { groupId } = await params;
  const [t, commonT, locale] = await Promise.all([
    getTranslations("admin.groups.detail"),
    getTranslations("admin.common"),
    getLocale(),
  ]);

  const [group, members, messages] = await Promise.all([
    getAdminStudyGroupDetail(groupId),
    getAdminStudyGroupMembers(groupId),
    getAdminStudyGroupMessages(groupId),
  ]);

  if (!group) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-surface p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          {group.name}
        </h1>

        <p className="mt-3 max-w-3xl text-muted-foreground">
          {commonT("owner")}: {group.owner_name ?? commonT("unknownOwner")} -{" "}
          {group.owner_email ?? group.owner_id}
        </p>

        {group.description ? (
          <p className="mt-3 max-w-3xl text-muted-foreground">
            {group.description}
          </p>
        ) : null}

        {group.admin_note ? (
          <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {t("adminNote")}: {group.admin_note}
          </p>
        ) : null}

        <div className="mt-5">
          <AdminGroupArchiveButton
            groupId={group.group_id}
            archived={Boolean(group.archived_at)}
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label={t("members")}
          value={group.member_count}
        />

        <AdminMetricCard
          label={commonT("messages")}
          value={group.message_count}
        />

        <AdminMetricCard
          label={commonT("status")}
          value={commonT(
            `groupStatus.${group.archived_at ? "archived" : "active"}`
          )}
        />

        <AdminMetricCard
          label={t("private")}
          value={group.is_private ? commonT("yes") : commonT("no")}
        />

        <AdminMetricCard
          label={commonT("created")}
          value={new Intl.DateTimeFormat(locale).format(
            new Date(group.created_at)
          )}
        />

        <AdminMetricCard
          label={commonT("updated")}
          value={new Intl.DateTimeFormat(locale).format(
            new Date(group.updated_at)
          )}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <AdminGroupMembersTable members={members} />

        <AdminGroupMessagesTable
          groupId={groupId}
          messages={messages}
        />
      </div>
    </main>
  );
}
