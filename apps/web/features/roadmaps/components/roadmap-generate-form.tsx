"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

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
  return new Date().toISOString().slice(0, 10);
}

function addMonthsInputValue(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function RoadmapGenerateForm({
  preferredLocale,
}: RoadmapGenerateFormProps) {
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
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Roadmap Input
          </p>

          <h2 className="mt-2 text-2xl font-bold text-neutral-950 dark:text-neutral-50">
            What do you want to learn?
          </h2>

          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Provide enough context so the AI can generate a realistic tree of
            goals, tasks, and subtasks.
          </p>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Topic / Course *
            </span>

            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Example: Learn Python for Data Analytics"
              required
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Subject name
            </span>

            <input
              value={subjectName}
              onChange={(event) => setSubjectName(event.target.value)}
              placeholder="Example: Data Analytics"
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Output language
            </span>

            <input
              value={preferredLocale === "vi" ? "Vietnamese" : "English"}
              disabled
              className="w-full rounded-xl border bg-neutral-50 px-3 py-2.5 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Description / context
            </span>

            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe your goal, background, expected outcome, exam/project requirement, or anything the AI should consider."
              rows={5}
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-2xl font-bold text-neutral-950 dark:text-neutral-50">
          Level and target
        </h2>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Current level
            </span>

            <select
              value={currentLevel}
              onChange={(event) =>
                setCurrentLevel(event.target.value as RoadmapLevel)
              }
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            >
              {levels.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Target level
            </span>

            <select
              value={targetLevel}
              onChange={(event) =>
                setTargetLevel(event.target.value as RoadmapLevel)
              }
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            >
              {levels.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </label>

          {currentLevel === "custom" ? (
            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Custom current level
              </span>

              <input
                value={customCurrentLevel}
                onChange={(event) =>
                  setCustomCurrentLevel(event.target.value)
                }
                placeholder="Describe your current skill level"
                className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </label>
          ) : null}

          {targetLevel === "custom" ? (
            <label className="space-y-2">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Custom target level
              </span>

              <input
                value={customTargetLevel}
                onChange={(event) => setCustomTargetLevel(event.target.value)}
                placeholder="Describe your desired outcome"
                className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </label>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-2xl font-bold text-neutral-950 dark:text-neutral-50">
          Time plan
        </h2>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Start date
            </span>

            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              End date
            </span>

            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              required
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Study days per week
            </span>

            <input
              type="number"
              min={1}
              max={7}
              value={studyDaysPerWeek}
              onChange={(event) =>
                setStudyDaysPerWeek(Number(event.target.value))
              }
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Minutes per study day
            </span>

            <input
              type="number"
              min={10}
              max={480}
              value={minutesPerStudyDay}
              onChange={(event) =>
                setMinutesPerStudyDay(Number(event.target.value))
              }
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            />
          </label>

          <div className="md:col-span-2">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Available weekdays
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {weekdays.map((day) => {
                const active = availableWeekdays.includes(day.value);

                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleWeekday(day.value)}
                    className={
                      active
                        ? "rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-950"
                        : "rounded-full border px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
                    }
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
              Estimated weekly study time: {estimatedWeeklyHours} hour(s)
            </p>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          {isPending ? "Generating roadmap..." : "Generate roadmap"}
        </button>
      </div>
    </form>
  );
}