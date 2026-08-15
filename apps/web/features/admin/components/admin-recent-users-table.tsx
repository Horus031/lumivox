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

  return (
    <section className="rounded-2xl p-6 shadow-sm">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h2 className="mt-2 text-2xl font-bold text-foreground">
          {t("title")}
        </h2>
      </div>

      {users.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border">
          <table className="min-w-190 w-full text-sm">
            <thead className="bg-surface text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("user")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("role")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("leaderboard")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("created")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("lastSignIn")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y dark:divide-neutral-800">
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {displayName(user)}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {user.user_id}
                    </p>
                  </td>

                  <td className="px-4 py-3 capitalize text-foreground">
                    {commonT(`roles.${user.role}`)}
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {user.leaderboard_opt_in
                      ? commonT("visibility.visible")
                      : commonT("visibility.hidden")}
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {formatDate(user.created_at, locale, commonT("na"))}
                  </td>

                  <td className="px-4 py-3 text-foreground">
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
import { useLocale, useTranslations } from "next-intl";
