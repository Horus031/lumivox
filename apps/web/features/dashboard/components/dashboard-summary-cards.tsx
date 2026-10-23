import { ClipboardCheck, NotebookPen, ScanEye, Timer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

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
  const locale = useLocale();
  const formatter = new Intl.NumberFormat(locale);
  const cards = [
    {
      key: "completedTasks",
      value: completedTasks,
      icon: <ClipboardCheck />,
    },
    {
      key: "focusSessions",
      value: completedSessions,
      icon: <NotebookPen />,
    },
    {
      key: "focusMinutes",
      value: totalFocusMinutes,
      icon: <Timer />,
    },
    {
      key: "distractions",
      value: distractionEvents,
      icon: <ScanEye />,
    },
  ];

  return (
    <section className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map((card) => (
        <article
          key={card.key}
          className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-label text-secondary-text">
              {t(`${card.key}.title`)}
            </p>
            <span aria-hidden="true" className="hidden shrink-0 text-muted-foreground sm:inline-flex [&_svg]:size-icon">{card.icon}</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground tabular-nums [overflow-wrap:anywhere]">
            {formatter.format(card.value)}
          </p>
          <p className="mt-1 text-caption text-muted-foreground">{t(`${card.key}.subtitle`)}</p>
        </article>
      ))}
    </section>
  );
}
