import { useTranslations } from "next-intl";

type DashboardSummaryCardsProps = {
  completedTasks: number;
  completedSessions: number;
  totalFocusMinutes: number;
  distractionEvents: number;
};

export function DashboardSummaryCards({
  completedTasks,
  completedSessions,
  totalFocusMinutes,
  distractionEvents,
}: DashboardSummaryCardsProps) {
  const t = useTranslations("dashboard.summary");
  const cards = [
    {
      key: "completedTasks",
      value: completedTasks,
    },
    {
      key: "focusSessions",
      value: completedSessions,
    },
    {
      key: "focusMinutes",
      value: totalFocusMinutes,
    },
    {
      key: "distractions",
      value: distractionEvents,
    },
  ];

  return (
    <section className="flex flex-col md:flex-row justify-between gap-4">
      {cards.map((card) => (
        <article
          key={card.key}
          className="group w-full rounded-[28px] border border-border/70 bg-card/90 p-5 shadow-[0_16px_50px_-40px_hsl(var(--primary)/0.55)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_60px_-42px_hsl(var(--primary)/0.8)]"
        >
          <div className="mb-4 h-1.5 w-14 rounded-full bg-gradient-to-r from-primary via-teal-500 to-amber-400 opacity-80 transition group-hover:w-20" />

          <p className="text-sm font-medium text-muted-foreground">
            {t(`${card.key}.title`)}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {card.value}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(`${card.key}.subtitle`)}
          </p>
        </article>
      ))}
    </section>
  );
}
