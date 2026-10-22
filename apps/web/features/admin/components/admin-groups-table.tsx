import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminGroupArchiveButton } from "./admin-group-archive-button";
import { AdminTableSection } from "./admin-table-section";

type AdminGroup = {
  group_id: string;
  name: string;
  description: string | null;
  owner_id: string;
  owner_name: string | null;
  owner_email: string | null;
  is_private: boolean;
  archived_at: string | null;
  member_count: number;
  message_count: number;
  created_at: string;
};

export function AdminGroupsTable({ groups }: { groups: AdminGroup[] }) {
  const locale = useLocale();
  const t = useTranslations("admin.groups.table");
  const commonT = useTranslations("admin.common");
  return (
    <AdminTableSection title={t("title")} empty={groups.length === 0} emptyMessage={t("empty")} className="min-w-240">
      <thead className="border-b border-border bg-muted text-label text-secondary-text">
        <tr>{["group", "owner", "stats", "status", "created", "actions"].map((key) => <th key={key} scope="col">{commonT(key)}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-border">
        {groups.map((group) => (
          <tr key={group.group_id} className="hover:bg-muted/50">
            <td className="max-w-60 [overflow-wrap:anywhere]">
              <Link href={`/admin/groups/${group.group_id}`} className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{group.name}</Link>
              <p className="mt-1 line-clamp-2 text-caption text-muted-foreground">{group.description ?? commonT("noDescription")}</p>
            </td>
            <td className="max-w-52 [overflow-wrap:anywhere]">
              <p className="text-label font-medium text-foreground">{group.owner_name ?? commonT("unknownOwner")}</p>
              <p className="mt-1 text-caption text-muted-foreground">{group.owner_email ?? group.owner_id}</p>
            </td>
            <td className="text-caption tabular-nums text-secondary-text"><p>{t("stats.members", { count: group.member_count })}</p><p>{t("stats.messages", { count: group.message_count })}</p></td>
            <td><Badge variant="outline" className={group.archived_at ? "border-warning/25 bg-warning/10 text-foreground" : "border-success/25 bg-success/10 text-foreground"}>{commonT(`groupStatus.${group.archived_at ? "archived" : "active"}`)}</Badge></td>
            <td className="text-caption tabular-nums text-secondary-text">{new Date(group.created_at).toLocaleString(locale)}</td>
            <td className="min-w-64"><div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="icon"><Link href={`/admin/groups/${group.group_id}`} aria-label={`${commonT("view")}: ${group.name}`} title={commonT("view")}><ArrowUpRight aria-hidden="true" /></Link></Button>
              <AdminGroupArchiveButton groupId={group.group_id} archived={Boolean(group.archived_at)} compact />
            </div></td>
          </tr>
        ))}
      </tbody>
    </AdminTableSection>
  );
}
