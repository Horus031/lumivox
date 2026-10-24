"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { formatLocalDate, parseLocalDate } from "@/lib/local-date";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

import { useRouter } from "@/i18n/navigation";
import { generateLearningRoadmapAction } from "@/features/roadmaps/roadmap.actions";
import type {
  RoadmapLevel,
  SupportedLocale,
  Weekday,
} from "@/features/roadmaps/roadmap.types";

type RoadmapGenerateFormProps = {
  preferredLocale: SupportedLocale;
};

const weekdays: { value: Weekday; label: string }[] = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const levels: { value: RoadmapLevel; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "custom", label: "Custom" },
];

function todayInputValue() {
  return formatLocalDate(new Date());
}

function addMonthsInputValue(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return formatLocalDate(date);
}

export function RoadmapGenerateForm({
  preferredLocale,
}: RoadmapGenerateFormProps) {
  const t = useTranslations("roadmaps");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [topic, setTopic] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [description, setDescription] = useState("");

  const [currentLevel, setCurrentLevel] =
    useState<RoadmapLevel>("beginner");
  const [targetLevel, setTargetLevel] =
    useState<RoadmapLevel>("intermediate");

  const [customCurrentLevel, setCustomCurrentLevel] = useState("");
  const [customTargetLevel, setCustomTargetLevel] = useState("");

  const [startDate, setStartDate] = useState(todayInputValue());
  const [endDate, setEndDate] = useState(addMonthsInputValue(3));

  const [studyDaysPerWeek, setStudyDaysPerWeek] = useState(5);
  const [minutesPerStudyDay, setMinutesPerStudyDay] = useState(60);
  const [availableWeekdays, setAvailableWeekdays] = useState<Weekday[]>([
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
  ]);

  const estimatedWeeklyHours = useMemo(() => {
    return Math.round((studyDaysPerWeek * minutesPerStudyDay) / 60);
  }, [studyDaysPerWeek, minutesPerStudyDay]);

  function toggleWeekday(day: Weekday) {
    setAvailableWeekdays((current) => {
      if (current.includes(day)) {
        return current.filter((item) => item !== day);
      }

      return [...current, day];
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      try {
        const result = await generateLearningRoadmapAction({
          topic,
          subjectName,
          description,

          currentLevel,
          targetLevel,
          customCurrentLevel,
          customTargetLevel,

          startDate,
          endDate,

          studyDaysPerWeek,
          availableWeekdays,
          minutesPerStudyDay,

          preferredLocale,
        });

        if (!result.success) {
          toast.error(result.message);
          return;
        }

        toast.success(result.message);
        router.push(`/roadmaps/${result.data.roadmapId}`);
      } catch {
        toast.error(t("generateFailed"));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={isPending} className="min-w-0 rounded-lg border border-border bg-card p-card">
      <fieldset disabled={isPending} className="min-w-0 space-y-section">
      <section className="border-b border-border pb-card">
        <div>
          <h2 className="mt-2 text-section font-semibold text-foreground">
            {t("inputTitle")}
          </h2>

        </div>

        <div className="mt-4 grid gap-card md:grid-cols-2">
          <label className="block min-w-0 space-y-1.5 md:col-span-2">
            <span className="text-label font-medium text-foreground">
              {t("fields.topic")}
            </span>

            <Input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder={t("placeholders.topic")}
              required
              className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
            />
          </label>

          <label className="block min-w-0 space-y-1.5">
            <span className="text-label font-medium text-foreground">
              {t("fields.subject")}
            </span>

            <Input
              value={subjectName}
              onChange={(event) => setSubjectName(event.target.value)}
              placeholder={t("placeholders.subject")}
              className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
            />
          </label>

          <label className="block min-w-0 space-y-1.5">
            <span className="text-label font-medium text-foreground">
              {t("fields.language")}
            </span>

            <Input
              value={t(`languages.${preferredLocale}`)}
              disabled
              className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
            />
          </label>

          <label className="block min-w-0 space-y-1.5 md:col-span-2">
            <span className="text-label font-medium text-foreground">
              {t("fields.description")}
            </span>

            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("placeholders.description")}
              rows={3}
              className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
            />
          </label>
        </div>
      </section>

      <section className="border-b border-border pb-card">
        <h2 className="text-section font-semibold text-foreground">
          {t("levelTitle")}
        </h2>

        <div className="mt-4 grid gap-card md:grid-cols-2">
          <label className="block min-w-0 space-y-1.5">
            <span className="text-label font-medium text-foreground">
              {t("fields.currentLevel")}
            </span>

            <select
              value={currentLevel}
              onChange={(event) =>
                setCurrentLevel(event.target.value as RoadmapLevel)
              }
              className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
            >
              {levels.map((level) => (
                <option key={level.value} value={level.value}>
                  {t(`levels.${level.value}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0 space-y-1.5">
            <span className="text-label font-medium text-foreground">
              {t("fields.targetLevel")}
            </span>

            <select
              value={targetLevel}
              onChange={(event) =>
                setTargetLevel(event.target.value as RoadmapLevel)
              }
              className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
            >
              {levels.map((level) => (
                <option key={level.value} value={level.value}>
                  {t(`levels.${level.value}`)}
                </option>
              ))}
            </select>
          </label>

          {currentLevel === "custom" ? (
            <label className="block min-w-0 space-y-1.5">
              <span className="text-label font-medium text-foreground">
                {t("fields.customCurrent")}
              </span>

              <Input
                value={customCurrentLevel}
                onChange={(event) =>
                  setCustomCurrentLevel(event.target.value)
                }
                placeholder={t("placeholders.current")}
                className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
              />
            </label>
          ) : null}

          {targetLevel === "custom" ? (
            <label className="block min-w-0 space-y-1.5">
              <span className="text-label font-medium text-foreground">
                {t("fields.customTarget")}
              </span>

              <Input
                value={customTargetLevel}
                onChange={(event) => setCustomTargetLevel(event.target.value)}
                placeholder={t("placeholders.target")}
                className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
              />
            </label>
          ) : null}
        </div>
      </section>

      <section className="border-b border-border pb-card">
        <h2 className="text-section font-semibold text-foreground">
          {t("scheduleTitle")}
        </h2>

        <div className="mt-4 grid gap-card md:grid-cols-2">
          <DatePicker label={t("fields.startDate")} value={parseLocalDate(startDate)} onChange={(date) => setStartDate(formatLocalDate(date))} disabled={isPending} required />

          <DatePicker label={t("fields.endDate")} value={parseLocalDate(endDate)} onChange={(date) => setEndDate(formatLocalDate(date))} disabled={isPending} required />

          <label className="block min-w-0 space-y-1.5">
            <span className="text-label font-medium text-foreground">
              {t("fields.days")}
            </span>

            <Input
              type="number"
              min={1}
              max={7}
              value={studyDaysPerWeek}
              onChange={(event) =>
                setStudyDaysPerWeek(Number(event.target.value))
              }
              className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
            />
          </label>

          <label className="block min-w-0 space-y-1.5">
            <span className="text-label font-medium text-foreground">
              {t("fields.minutes")}
            </span>

            <Input
              type="number"
              min={10}
              max={480}
              value={minutesPerStudyDay}
              onChange={(event) =>
                setMinutesPerStudyDay(Number(event.target.value))
              }
              className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
            />
          </label>

          <div className="md:col-span-2">
            <p className="text-label font-medium text-foreground">
              {t("fields.weekdays")}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {weekdays.map((day) => {
                const active = availableWeekdays.includes(day.value);

                return (
                  <Button
                    key={day.value}
                    type="button"
                    onClick={() => toggleWeekday(day.value)}
                    aria-pressed={active}
                    size="sm"
                    variant={active ? "default" : "outline"}

                  >
                    {t(`weekdays.${day.value}`)}
                  </Button>
                );
              })}
            </div>

            <p className="mt-3 text-caption text-muted-foreground">
              {t("weeklyHours", { hours: estimatedWeeklyHours })}
            </p>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
        >
          <Sparkles aria-hidden="true" />
          {isPending ? t("generating") : t("generate")}
        </Button>
      </div>
      </fieldset>
    </form>
  );
}
