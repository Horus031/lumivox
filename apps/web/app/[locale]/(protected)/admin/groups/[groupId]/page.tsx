import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { AdminGroupArchiveButton } from "@/features/admin/components/admin-group-archive-button";
import { AdminGroupMembersTable } from "@/features/admin/components/admin-group-members-table";
import { AdminGroupMessagesTable } from "@/features/admin/components/admin-group-messages-table";
import { getAdminStudyGroupDetail, getAdminStudyGroupMembers, getAdminStudyGroupMessages } from "@/features/admin/admin-groups.queries";

export default async function AdminGroupDetailPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [t, commonT, locale] = await Promise.all([getTranslations("admin.groups.detail"), getTranslations("admin.common"), getLocale()]);
  const [group, members, messages] = await Promise.all([getAdminStudyGroupDetail(groupId), getAdminStudyGroupMembers(groupId), getAdminStudyGroupMessages(groupId)]);
  if (!group) notFound();
  const metadata = [
    [t("members"), group.member_count], [commonT("messages"), group.message_count],
    [commonT("status"), commonT(`groupStatus.${group.archived_at ? "archived" : "active"}`)],
    [t("private"), group.is_private ? commonT("yes") : commonT("no")],
    [commonT("created"), new Intl.DateTimeFormat(locale).format(new Date(group.created_at))],
    [commonT("updated"), new Intl.DateTimeFormat(locale).format(new Date(group.updated_at))],
  ];
  return (
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={group.name} description={`${commonT("owner")}: ${group.owner_name ?? commonT("unknownOwner")} - ${group.owner_email ?? group.owner_id}`} action={
        <Button asChild variant="outline"><Link href="/admin/groups"><ArrowLeft aria-hidden="true" />{commonT("backToList")}</Link></Button>
      } />
      {group.description && <p className="text-body text-secondary-text [overflow-wrap:anywhere]">{group.description}</p>}
      {group.admin_note && <div className="border-l-2 border-warning pl-3"><p className="text-label font-medium text-foreground">{t("adminNote")}</p><p className="mt-1 whitespace-pre-wrap text-body text-secondary-text [overflow-wrap:anywhere]">{group.admin_note}</p></div>}
      <div className="border-y border-border py-card"><div className="max-w-md"><AdminGroupArchiveButton groupId={group.group_id} archived={Boolean(group.archived_at)} /></div></div>
      <dl className="grid min-w-0 gap-x-section gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {metadata.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-label text-muted-foreground">{label}</dt><dd className="mt-1 text-body font-medium tabular-nums text-foreground [overflow-wrap:anywhere]">{value}</dd></div>)}
      </dl>
      <div className="grid min-w-0 gap-section xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <AdminGroupMembersTable members={members} />
        <AdminGroupMessagesTable groupId={groupId} messages={messages} />
      </div>
    </div>
  );
}
