"use client";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { calendarMonth, type StudyPlanDisplayDay } from "../study-plan-projection";
import { StudyPlanSessions } from "./todays-study-plan";

export function StudyCalendar({
  month,
  days,
  focusEnabled,
}: {
  month: string;
  days: StudyPlanDisplayDay[];
  focusEnabled?: boolean;
}) {
  const t = useTranslations("studyPlan"),
    locale = useLocale();
  const parsed = calendarMonth(month),
    first = parsed.toPlainDate({ day: 1 });
  const offset = first.dayOfWeek - 1;
  const cells = Array.from(
    { length: Math.ceil((offset + parsed.daysInMonth) / 7) * 7 },
    (_, i) => i - offset + 1,
  );
  const byDate = new Map(days.map((day) => [day.localDate, day.sessions]));
  const monthName = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  // ICU/CLDR weekday abbreviations differ between Node and Chromium (e.g.
  // Vietnamese "Th 2" vs "Thứ 2"). Catalog labels keep SSR and hydration equal.
  const weekdays = ([1, 2, 3, 4, 5, 6, 7] as const).map((day) => t(`weekdays.${day}`));
  return (
    <Card className="p-3 sm:p-5" data-testid="study-calendar">
      <section aria-labelledby="study-calendar-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="study-calendar-heading" className="text-xl font-semibold">
            {monthName}
          </h2>
          <nav aria-label={t("monthNavigation")} className="flex gap-2">
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              aria-label={t("previousMonth")}
              href={{
                pathname: "/study-plan",
                query: { month: parsed.subtract({ months: 1 }).toString() },
              }}
            >
              ← {t("previous")}
            </Link>
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              aria-label={t("nextMonth")}
              href={{
                pathname: "/study-plan",
                query: { month: parsed.add({ months: 1 }).toString() },
              }}
            >
              {t("next")} →
            </Link>
          </nav>
        </div>
        <p className="my-3 text-sm text-secondary-text">{t("calendarHint")}</p>
        <table className="w-full table-fixed border-collapse text-center text-xs sm:text-sm">
          <caption className="sr-only">
            {t("calendarTitle")} · {monthName}
          </caption>
          <thead>
            <tr>
              {weekdays.map((day, i) => (
                <th key={i} scope="col" className="py-2 font-medium">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: cells.length / 7 }, (_, week) => (
              <tr key={week}>
                {cells.slice(week * 7, week * 7 + 7).map((day, i) => {
                  if (day < 1 || day > parsed.daysInMonth)
                    return <td key={i} className="border border-border" />;
                  const date = first.with({ day }).toString(),
                    sessions = byDate.get(date) ?? [];
                  return (
                    <td
                      key={i}
                      className="h-24 border border-border p-1 align-top"
                      data-calendar-date={date}
                    >
                      {sessions.length ? (
                        <a
                          className="block rounded py-1 underline focus-visible:outline focus-visible:outline-2"
                          href={`#study-day-${date}`}
                          aria-label={`${date}: ${t("sessionCount", { count: sessions.length })}`}
                        >
                          <time dateTime={date}>{day}</time>
                        </a>
                      ) : (
                        <time dateTime={date}>{day}</time>
                      )}
                      {sessions.length > 0 && (
                        <>
                          <span className="block">
                            {t("sessionCount", { count: sessions.length })}
                          </span>
                          {[...new Set(sessions.map((s) => s.status))].map((status) => (
                            <span key={status} className="block break-words text-secondary-text">
                              {t(`status.${status}`)}
                            </span>
                          ))}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {days.length === 0 ? (
          <p className="py-6 text-secondary-text">{t("monthEmpty")}</p>
        ) : (
          <div className="mt-5 space-y-5">
            {days.map((day) => (
              <section
                key={day.localDate}
                id={`study-day-${day.localDate}`}
                aria-label={day.localDate}
                className="scroll-mt-24"
              >
                <h3 className="font-semibold">
                  <time dateTime={day.localDate}>{day.localDate}</time>
                </h3>
                <StudyPlanSessions sessions={day.sessions} focusEnabled={focusEnabled} />
              </section>
            ))}
          </div>
        )}
      </section>
    </Card>
  );
}
