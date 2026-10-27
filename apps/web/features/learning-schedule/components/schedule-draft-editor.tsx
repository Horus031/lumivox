"use client";

import { useMemo, useState } from "react";

import {
  generateStudyOccurrences,
  type StudyScheduleInput,
} from "../schedule-engine";

type Props = {
  initialValue: StudyScheduleInput;
  onContinue?: (draft: StudyScheduleInput) => void;
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ScheduleDraftEditor({ initialValue, onContinue }: Props) {
  const [draft, setDraft] = useState<StudyScheduleInput>(initialValue);

  const preview = useMemo(() => {
    try {
      const occurrences = generateStudyOccurrences(draft);

      return {
        occurrences,
        error: null as string | null,
      };
    } catch (error) {
      return {
        occurrences: [],
        error: error instanceof Error ? error.message : "Invalid schedule",
      };
    }
  }, [draft]);

  const update = (patch: Partial<StudyScheduleInput>) => {
    setDraft((current) => ({
      ...current,
      ...patch,
    }));
  };

  const updateSlot = (
    index: number,
    field: "weekday" | "startTime" | "endTime",
    value: number | string,
  ) => {
    setDraft((current) => ({
      ...current,
      slots: current.slots.map((slot, i) =>
        i === index ? { ...slot, [field]: value } : slot,
      ),
    }));
  };

  const canContinue = !preview.error && preview.occurrences.length > 0;

  return (
    <section aria-label="Study schedule editor" className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="block text-sm font-medium">Start date</span>
          <input
            type="date"
            value={draft.startsOn}
            onChange={(event) => update({ startsOn: event.target.value })}
            className="w-full rounded-md border p-2"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium">End date</span>
          <input
            type="date"
            value={draft.endsOn}
            onChange={(event) => update({ endsOn: event.target.value })}
            className="w-full rounded-md border p-2"
          />
        </label>
      </div>

      <label className="block space-y-2">
        <span className="block text-sm font-medium">IANA timezone</span>
        <input
          value={draft.timezone}
          onChange={(event) => update({ timezone: event.target.value })}
          placeholder="Asia/Ho_Chi_Minh"
          className="w-full rounded-md border p-2"
        />
      </label>

      <fieldset className="space-y-3">
        <legend className="font-medium">Weekly study slots</legend>

        {draft.slots.map((slot, index) => (
          <div
            key={index}
            className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-4"
          >
            <label className="space-y-1">
              <span className="block text-xs">Weekday</span>
              <select
                value={slot.weekday}
                onChange={(event) =>
                  updateSlot(index, "weekday", Number(event.target.value))
                }
                className="w-full rounded-md border p-2"
              >
                {weekdays.map((day, i) => (
                  <option key={day} value={i + 1}>
                    {day}
                  </option>
                ))}
              </select>
            </label>

            {(["startTime", "endTime"] as const).map((field) => (
              <label key={field} className="space-y-1">
                <span className="block text-xs">
                  {field === "startTime" ? "Start" : "End"}
                </span>
                <input
                  type="time"
                  value={slot[field]}
                  onChange={(event) =>
                    updateSlot(index, field, event.target.value)
                  }
                  className="w-full rounded-md border p-2"
                />
              </label>
            ))}

            <button
              type="button"
              aria-label={`Remove slot ${index + 1}`}
              onClick={() =>
                update({
                  slots: draft.slots.filter((_, i) => i !== index),
                })
              }
              className="rounded-md border px-3 py-2 text-sm"
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          disabled={draft.slots.length >= 21}
          onClick={() =>
            update({
              slots: [
                ...draft.slots,
                {
                  weekday: 1,
                  startTime: "19:00",
                  endTime: "20:00",
                },
              ],
            })
          }
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
        >
          Add weekly slot
        </button>
      </fieldset>

      <section
        aria-label="Schedule preview"
        className="space-y-2 rounded-md border p-4"
      >
        <h3 className="font-medium">Upcoming study sessions</h3>

        {preview.error ? (
          <p role="alert" className="text-sm text-red-600">
            {preview.error}
          </p>
        ) : preview.occurrences.length === 0 ? (
          <p className="text-sm">No sessions match this date range.</p>
        ) : (
          <>
            <p className="text-sm">
              {preview.occurrences.length} sessions across this schedule.
            </p>

            <ul className="space-y-1 text-sm">
              {preview.occurrences.slice(0, 8).map((session) => (
                <li key={session.occurrenceKey}>
                  {session.localDate} · {session.localStartTime}–
                  {session.localEndTime}
                </li>
              ))}
            </ul>

            {preview.occurrences.length > 8 && (
              <p className="text-xs opacity-70">
                Showing the first 8 sessions.
              </p>
            )}
          </>
        )}
      </section>

      <button
        type="button"
        disabled={!canContinue || !onContinue}
        onClick={() => onContinue?.(draft)}
        className="rounded-md border px-4 py-2 disabled:opacity-50"
      >
        Continue
      </button>
    </section>
  );
}
