import { ClipboardCheck, NotebookPen, ScanEye, Timer } from "lucide-react";
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
    <section className="flex flex-col md:flex-row justify-between gap-4">
      {cards.map((card) => (
        <article
          key={card.key}
          className="group w-full rounded-2xl bg-card/90 p-4 shadow-[0_16px_50px_-40px_hsl(var(--primary)/0.55)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_60px_-42px_hsl(var(--primary)/0.8)]"
        >
          {/* <div className="mb-4 h-1.5 w-14 rounded-full bg-gradient-to-r from-primary via-teal-500 to-amber-400 opacity-80 transition group-hover:w-20" /> */}
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-muted-foreground">
                {t(`${card.key}.title`)}
              </p>
              <p className="text-xl font-semibold tracking-tight text-foreground">
                {card.value}
              </p>
            </div>

            <div className="bg-primary/70 p-2 rounded-md text-white">{card.icon}</div>
          </div>
          {/* <p className="mt-1 text-xs text-muted-foreground">
            {t(`${card.key}.subtitle`)}
          </p> */}
        </article>
      ))}
    </section>
  );
}
