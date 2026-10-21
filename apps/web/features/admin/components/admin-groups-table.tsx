import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AdminGroupArchiveButton } from "./admin-group-archive-button";

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

type AdminGroupsTableProps = {
  groups: AdminGroup[];
};

export function AdminGroupsTable({ groups }: AdminGroupsTableProps) {
  const locale = useLocale();
  const t = useTranslations("admin.groups.table");
  const commonT = useTranslations("admin.common");

  return (
    <section className="rounded-2xl shadow-sm">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h2 className="mt-2 text-2xl font-bold text-foreground">
          {t("title")}
        </h2>
      </div>

      {groups.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl">
          <table className="min-w-275 w-full text-sm">
            <thead className="bg-surface text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("group")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("owner")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("stats")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("status")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("created")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("actions")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y dark:divide-neutral-800">
              {groups.map((group) => (
                <tr key={group.group_id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {group.name}
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {group.description ?? commonT("noDescription")}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {group.owner_name ?? commonT("unknownOwner")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {group.owner_email ?? group.owner_id}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    <p>{t("stats.members", { count: group.member_count })}</p>
                    <p>{t("stats.messages", { count: group.message_count })}</p>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        group.archived_at
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      }`}
                    >
                      {group.archived_at
                        ? commonT("groupStatus.archived")
                        : commonT("groupStatus.active")}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">
                    {new Date(group.created_at).toLocaleString(locale)}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/groups/${group.group_id}`}
                        className="rounded-xl h-fit border px-3 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                      >
                        {commonT("view")}
                      </Link>

                      <AdminGroupArchiveButton
                        groupId={group.group_id}
                        archived={Boolean(group.archived_at)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
