import { ChevronDown } from "lucide-react";
import {
  useLocale,
  useTranslations,
} from "next-intl";

import type {
  WeeklyReflectionAction,
  WeeklyReflectionCardView,
  WeeklyReflectionMetrics,
  WeeklyReflectionWatchout,
  WeeklyReflectionWin,
} from "@/features/weekly-reflections/weekly-reflection.types";


type WeeklyReflectionCardProps = {
  card: WeeklyReflectionCardView;
};


function directionBadgeClass(
  direction:
    | "improving"
    | "stable"
    | "mixed"
    | "needs_attention"
    | undefined,
) {
  if (
    direction
    === "improving"
  ) {
    return (
      "border-success/25 bg-success/10 text-foreground"
    );
  }

  if (
    direction
    === "needs_attention"
  ) {
    return (
      "border-danger/25 bg-danger/10 text-foreground"
    );
  }

  if (
    direction
    === "mixed"
  ) {
    return (
      "border-warning/25 bg-warning/10 text-foreground"
    );
  }

  return (
    "border-border bg-muted text-foreground"
  );
}


function formatWindow(
  value:
    string | undefined,

  locale:
    string,
) {
  if (!value) {
    return null;
  }

  return (
    new Intl.DateTimeFormat(
      locale,
      {
        dateStyle:
          "medium",
      },
    )
    .format(
      new Date(
        value,
      ),
    )
  );
}


function formatPercent(
  value: number,

  locale: string,
) {
  return (
    new Intl.NumberFormat(
      locale,
      {
        maximumFractionDigits:
          1,
      },
    )
    .format(
      value,
    )
  );
}


export function WeeklyReflectionCard({
  card,
}: WeeklyReflectionCardProps) {
  const locale =
    useLocale();

  const t =
    useTranslations(
      "reflections.card",
    );

  const reflection =
    card.weekly_reflections;

  const currentMetrics =
    (reflection?.current_metrics as WeeklyReflectionMetrics | null) ?? null;

  const wins = (card.wins as WeeklyReflectionWin[] | null) ?? [];

  const watchouts = (card.watchouts as WeeklyReflectionWatchout[] | null) ?? [];

  const actions = (card.next_week_actions as WeeklyReflectionAction[] | null)?? [];

  const direction =
    reflection
      ?.reflection_direction
    ?? "unknown";

  const windowStart =
    formatWindow(
      reflection
        ?.current_window_start,

      locale,
    )
    ?? t("unknown");

  const windowEnd =
    formatWindow(
      reflection
        ?.current_window_end,

      locale,
    )
    ?? t("unknown");

  const reviewAttempts =
    currentMetrics
      ?.review_attempts
    ?? 0;

  const reviewedTasks =
    currentMetrics
      ?.reviewed_tasks
    ?? 0;

  const averageReviewScore =
    currentMetrics
      ?.average_review_score
    ?? null;

  const reviewPassRate =
    currentMetrics
      ?.review_pass_rate
    ?? null;

  const weakAreas =
    currentMetrics
      ?.top_review_weak_areas
    ?? [];

  return (
    <article className="min-w-0 rounded-lg border border-border bg-card p-card [overflow-wrap:anywhere]">
      <div className="grid min-w-0 gap-section lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-sm border border-border bg-muted px-2 py-0.5 text-caption font-medium text-foreground">
              {t(
                "badge",
              )}
            </span>

            <span
              className={[
                "rounded-sm border px-2 py-0.5 text-caption font-medium",
                directionBadgeClass(
                  reflection
                    ?.reflection_direction,
                ),
              ].join(" ")}
            >
              {t(
                `direction.${direction}`,
              )}
            </span>
          </div>

          <div>
            <h3 className="text-section font-semibold text-foreground">
              {
                card.title
              }
            </h3>

            <p className="mt-1 text-body text-secondary-text">
              {
                card.summary
              }
            </p>
          </div>

          <div className="min-w-0 border-t border-border pt-3">
            <p className="text-label font-medium text-foreground">
              {t(
                "reflection",
              )}
            </p>

            <p className="mt-2 text-body text-secondary-text">
              {
                card
                  .reflection_interpretation
              }
            </p>
          </div>
        </div>

        <div className="min-w-0 border-t border-border pt-3">
          <p className="text-label font-medium text-foreground">
            {t(
              "currentWindow",
            )}
          </p>

          <p className="mt-2 text-body text-foreground">
            {
              windowStart
            }
          </p>

          <p className="text-body text-foreground">
            {"->"}{" "}
            {
              windowEnd
            }
          </p>

          {currentMetrics ? (
            <div className="mt-3 space-y-2 text-label text-secondary-text">
              <p>
                {t(
                  "metrics.focus",
                )}{" "}

                <span className="font-semibold">
                  {t(
                    "metrics.minutes",
                    {
                      count:
                        currentMetrics
                          .completed_focus_minutes,
                    },
                  )}
                </span>
              </p>

              <p>
                {t(
                  "metrics.tasksDone",
                )}{" "}

                <span className="font-semibold">
                  {
                    currentMetrics
                      .completed_tasks
                  }
                </span>
              </p>

              <p>
                {t(
                  "metrics.activeDays",
                )}{" "}

                <span className="font-semibold">
                  {
                    currentMetrics
                      .active_focus_days
                  }
                </span>
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {reviewAttempts > 0 ? (
        <section className="mt-section min-w-0 border-t border-border pt-card">
          <div>
            <h4 className="text-section font-semibold text-foreground">
              {t(
                "mastery.title",
              )}
            </h4>

            <p className="mt-1 max-w-3xl text-caption text-muted-foreground">
              {t(
                "mastery.description",
              )}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MasteryMetric
              label={t(
                "mastery.attempts",
              )}
              value={
                reviewAttempts
              }
            />

            <MasteryMetric
              label={t(
                "mastery.reviewedTasks",
              )}
              value={
                reviewedTasks
              }
            />

            <MasteryMetric
              label={t(
                "mastery.averageScore",
              )}
              value={
                averageReviewScore
                  !== null
                  ? t(
                      "mastery.percent",
                      {
                        value:
                          formatPercent(
                            averageReviewScore,
                            locale,
                          ),
                      },
                    )
                  : t(
                      "mastery.notAvailable",
                    )
              }
            />

            <MasteryMetric
              label={t(
                "mastery.passRate",
              )}
              value={
                reviewPassRate
                  !== null
                  ? t(
                      "mastery.percent",
                      {
                        value:
                          formatPercent(
                            reviewPassRate,
                            locale,
                          ),
                      },
                    )
                  : t(
                      "mastery.notAvailable",
                    )
              }
            />
          </div>

          {weakAreas.length > 0 ? (
            <div className="mt-4">
              <p className="text-label font-medium text-foreground">
                {t(
                  "mastery.weakAreas",
                )}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {weakAreas.map(
                  (
                    area,
                  ) => (
                    <span
                      key={
                        area
                      }
                      className="max-w-full rounded-sm border border-border px-2 py-0.5 text-caption text-foreground [overflow-wrap:anywhere]"
                    >
                      {
                        area
                      }
                    </span>
                  ),
                )}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mt-section grid min-w-0 grid-cols-3 gap-3 border-t border-border pt-card">
        <MiniSummary
          label={t(
            "wins",
          )}
          value={
            wins.length
          }
          tone="emerald"
        />

        <MiniSummary
          label={t(
            "watchouts",
          )}
          value={
            watchouts.length
          }
          tone="amber"
        />

        <MiniSummary
          label={t(
            "actions",
          )}
          value={
            actions.length
          }
          tone="primary"
        />
      </div>

      <details className="group mt-section min-w-0 border-t border-border pt-card">
        <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div>
            <h4 className="text-section font-semibold text-foreground">
              {t(
                "detailsTitle",
              )}
            </h4>

            <p className="mt-1 text-caption text-muted-foreground">
              {t(
                "detailsDescription",
              )}
            </p>
          </div>

          <ChevronDown className="size-icon shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>

        <div className="mt-4 space-y-4">
          <ReflectionList
            title={t(
              "wins",
            )}
            empty={t(
              "emptyWins",
            )}
            items={wins.map(
              (
                item,
              ) => ({
                key:
                  item
                    .evidence_key,

                body:
                  item
                    .student_friendly_explanation,
              }),
            )}
          />

          <ReflectionList
            title={t(
              "watchouts",
            )}
            empty={t(
              "emptyWatchouts",
            )}
            items={watchouts.map(
              (
                item,
              ) => ({
                key:
                  item
                    .evidence_key,

                body:
                  item
                    .student_friendly_explanation,
              }),
            )}
          />

          <ReflectionList
            title={t(
              "nextWeekActions",
            )}
            empty={t(
              "emptyActions",
            )}
            items={actions.map(
              (
                item,
              ) => ({
                key:
                  item.action,

                body:
                  item.rationale,
              }),
            )}
          />
        </div>
      </details>

      <div className="mt-section border-t border-border pt-card">
        <p className="text-label font-medium text-foreground">
          {t(
            "confidenceNote",
          )}
        </p>

        <p className="mt-1 text-body text-muted-foreground">
          {
            card
              .confidence_note
          }
        </p>
      </div>
    </article>
  );
}


type MiniSummaryProps = {
  label: string;

  value: number;

  tone:
    | "emerald"
    | "amber"
    | "primary";
};


function MiniSummary({
  label,
  value,
  tone,
}: MiniSummaryProps) {
  const toneClass =
    tone === "emerald"
      ? (
          "border-success/25 bg-success/10 text-foreground"
        )
      : tone === "amber"
        ? (
            "border-warning/25 bg-warning/10 text-foreground"
          )
        : (
            "border-border bg-muted text-foreground"
          );

  return (
    <div className="min-w-0">
      <p
        className={[
          "inline-flex max-w-full rounded-sm border px-2 py-0.5 text-caption font-medium",
          toneClass,
        ].join(" ")}
      >
        {
          label
        }
      </p>

      <p className="mt-2 text-section font-semibold tabular-nums text-foreground">
        {
          value
        }
      </p>
    </div>
  );
}


type MasteryMetricProps = {
  label: string;

  value:
    string
    | number;
};


function MasteryMetric({
  label,
  value,
}: MasteryMetricProps) {
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <p className="text-caption text-muted-foreground">
        {
          label
        }
      </p>

      <p className="mt-1 text-section font-semibold tabular-nums text-foreground">
        {
          value
        }
      </p>
    </div>
  );
}


type ReflectionListProps = {
  title: string;

  empty: string;

  items: Array<{
    key: string;

    body: string;
  }>;
};


function ReflectionList({
  title,
  empty,
  items,
}: ReflectionListProps) {
  return (
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
      <h4 className="text-section font-semibold text-foreground">
        {
          title
        }
      </h4>

      <div className="divide-y divide-border">
        {items.length === 0 ? (
          <p className="text-body text-muted-foreground">
            {
              empty
            }
          </p>
        ) : (
          items.map(
            (
              item,
            ) => (
              <div
                key={
                  item.key
                }
                className="min-w-0 py-3"
              >
                <p className="text-caption font-medium text-muted-foreground">
                  {item.key
                    .replaceAll(
                      "_",
                      " ",
                    )}
                </p>

                <p className="mt-2 text-body text-secondary-text">
                  {
                    item.body
                  }
                </p>
              </div>
            ),
          )
        )}
      </div>
    </section>
  );
}
