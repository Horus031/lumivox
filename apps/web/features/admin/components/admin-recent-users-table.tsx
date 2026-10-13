import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";

type RecentUser = {
  user_id: string;
  full_name: string | null;
  display_name: string | null;
  role: string;
  leaderboard_opt_in: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
};

type AdminRecentUsersTableProps = {
  users: RecentUser[];
};

function displayName(user: RecentUser) {
  return (
    user.display_name ||
    user.full_name ||
    `User ${user.user_id.slice(0, 8)}`
  );
}

function formatDate(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback;

  return new Date(value).toLocaleString(locale);
}

export function AdminRecentUsersTable({
  users,
}: AdminRecentUsersTableProps) {
  const locale = useLocale();
  const t = useTranslations("admin.users.recentTable");
  const commonT = useTranslations("admin.common");
  const titleId = useId();

  return (
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
      <h2 id={titleId} className="text-section font-semibold text-foreground">
        {t("title")}
      </h2>

      {users.length === 0 ? (
        <div className="py-section">
          <p className="text-body text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div role="region" aria-labelledby={titleId} tabIndex={0} className="max-w-full overflow-x-auto rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <table className="min-w-190 w-full text-left text-body">
            <caption className="sr-only">{t("title")}</caption>
            <thead className="border-b border-border bg-muted text-label text-secondary-text">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {commonT("user")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {commonT("role")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {commonT("leaderboard")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {commonT("created")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {commonT("lastSignIn")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.user_id} className="hover:bg-muted/50">
                  <td className="max-w-72 px-3 py-3 align-top [overflow-wrap:anywhere]">
                    <Link href={`/admin/users/${user.user_id}`} className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {displayName(user)}
                    </Link>

                    <p className="mt-1 text-caption text-muted-foreground">
                      {user.user_id}
                    </p>
                  </td>

                  <td className="px-3 py-3 align-top">
                    <Badge variant="outline">{commonT(`roles.${user.role}`)}</Badge>
                  </td>

                  <td className="px-3 py-3 align-top text-secondary-text">
                    {user.leaderboard_opt_in
                      ? commonT("visibility.visible")
                      : commonT("visibility.hidden")}
                  </td>

                  <td className="px-3 py-3 align-top tabular-nums text-secondary-text">
                    {formatDate(user.created_at, locale, commonT("na"))}
                  </td>

                  <td className="px-3 py-3 align-top tabular-nums text-secondary-text">
                    {formatDate(user.last_sign_in_at, locale, commonT("na"))}
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
