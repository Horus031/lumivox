import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

import type { UserEngagementStats } from "@/features/engagement-retention/engagement-retention.types";

type FrozenStreakAlertProps = {
  stats: UserEngagementStats | null;
};

function formatDeadline(value: string | null, locale: string) {
  if (!value) return null;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export async function FrozenStreakAlert({ stats }: FrozenStreakAlertProps) {
  const locale = await getLocale();
  const t = await getTranslations("dashboard.frozenStreak");

  if (!stats || stats.streak_status !== "frozen") {
    return null;
  }

  const deadline =
    formatDeadline(stats.streak_restore_deadline_at, locale) ?? t("soon");

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
            {t("eyebrow")}
          </p>

          <h2 className="mt-1 text-xl font-bold text-amber-950">
            {t("title")}
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900">
            {t.rich("description", {
              deadline: () => (
                <span className="font-semibold">{deadline}</span>
              ),
            })}
          </p>
        </div>

        <Link
          href="/settings#streak-restore"
          className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
        >
          {t("cta")}
        </Link>
      </div>
    </section>
  );
}
