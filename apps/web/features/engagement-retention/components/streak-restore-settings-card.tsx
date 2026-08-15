import type { UserEngagementStats } from "@/features/engagement-retention/engagement-retention.types";
import { RestoreStreakButton } from "@/features/engagement-retention/components/restore-streak-button";
import { useLocale, useTranslations } from "next-intl";

type StreakRestoreSettingsCardProps = {
  stats: UserEngagementStats | null;
};

function formatDeadline(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusClass(status: string | null | undefined) {
  if (status === "active") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "frozen") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-red-50 text-red-700";
}

export function StreakRestoreSettingsCard({
  stats,
}: StreakRestoreSettingsCardProps) {
  const locale = useLocale();
  const t = useTranslations("settings.streak");
  const isFrozen = stats?.streak_status === "frozen";
  const hasEnoughTokens = Number(stats?.token_balance ?? 0) >= 30;
  const canRestore = isFrozen && hasEnoughTokens;

  return (
    <section
      id="streak-restore"
      className="scroll-mt-24 rounded-2xl border bg-background p-6 shadow-sm"
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            {t("eyebrow")}
          </p>

          <h2 className="mt-2 text-2xl font-bold tracking-tight">
            {t("title")}
          </h2>

          <p className="mt-2 max-w-3xl text-neutral-600">
            {t("description")}
          </p>
        </div>
      </div>

      {!stats ? (
        <p className="mt-2 text-sm text-neutral-600">
          {t("preparing")}
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusClass(
                stats.streak_status,
              )}`}
            >
              {t("statusBadge", {
                status: t(`status.${stats.streak_status}`),
              })}
            </span>

            <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-foreground">
              {t("tokens", { count: stats.token_balance })}
            </span>

            <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-foreground">
              {t("dayStreak", { count: stats.current_streak_days })}
            </span>
          </div>

          {isFrozen ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="font-semibold text-amber-950">
                {t("frozenTitle")}
              </p>

              <p className="mt-2 text-sm leading-6 text-amber-900">
                {t("restoreDeadline")}{" "}
                <span className="font-semibold">
                  {formatDeadline(
                    stats.streak_restore_deadline_at,
                    locale,
                    t("notAvailable"),
                  )}
                </span>
              </p>

              <p className="mt-2 text-sm leading-6 text-amber-900">
                {t("restoreCost")}{" "}
                <span className="font-semibold">
                  {t("tokens", { count: 30 })}
                </span>
                . {t("currentlyHave")}{" "}
                <span className="font-semibold">
                  {t("tokens", { count: stats.token_balance })}
                </span>
                .
              </p>

              <div className="mt-4">
                <RestoreStreakButton disabled={!canRestore} />
              </div>

              {!hasEnoughTokens ? (
                <p className="mt-3 text-sm font-medium text-amber-950">
                  {t("notEnoughTokens")}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border bg-surface p-5">
              <p className="font-semibold text-foreground">
                {t("noActionTitle")}
              </p>

              <p className="mt-2 text-sm leading-6 text-neutral-600">
                {t.rich("noActionDescription", {
                  status: t(`status.${stats.streak_status}`),
                  strong: (chunks) => (
                    <span className="font-semibold">{chunks}</span>
                  ),
                })}
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <MiniMetric
              label={t("metrics.currentStreak")}
              value={t("days", { count: stats.current_streak_days })}
            />

            <MiniMetric
              label={t("metrics.longestStreak")}
              value={t("days", { count: stats.longest_streak_days })}
            />

            <MiniMetric
              label={t("metrics.tokensSpent")}
              value={`${stats.total_tokens_spent ?? 0}`}
            />
          </div>
        </div>
      )}
    </section>
  );
}

type MiniMetricProps = {
  label: string;
  value: string;
};

function MiniMetric({ label, value }: MiniMetricProps) {
  return (
    <div className="rounded-2xl border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>

      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}
