"use client";

import { useLocale, useTranslations } from "next-intl";
import { ScheduleValidationError, formatStudyDate } from "../schedule-presentation";

import { useId, useMemo, useState } from "react";

import {
  generateStudyOccurrences,
  type StudyScheduleInput,
} from "../schedule-engine";

type Props = {
  initialValue: StudyScheduleInput;
  onContinue?: (draft: StudyScheduleInput) => void;
};

const weekdays = [1, 2, 3, 4, 5, 6, 7];

export function ScheduleDraftEditor({ initialValue, onContinue }: Props) {
  const t = useTranslations("learningSchedule");
  const locale = useLocale();
  const fieldId = useId();
  const zones = useMemo(() => Array.from(new Set(["UTC", "Asia/Ho_Chi_Minh", ...Intl.supportedValuesOf("timeZone")])), []);
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
        error: error instanceof ScheduleValidationError ? error.code : "invalidInput",
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
    <section aria-label={t("editor")} className="min-w-0 space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="block text-sm font-medium">{t("startDate")}</span>
          <input aria-invalid={Boolean(preview.error)} aria-describedby={preview.error ? `${fieldId}-error` : undefined}
            type="date"
            value={draft.startsOn}
            onChange={(event) => update({ startsOn: event.target.value })}
            className="min-w-0 w-full rounded-md border p-2"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium">{t("endDate")}</span>
          <input
            type="date"
            value={draft.endsOn}
            onChange={(event) => update({ endsOn: event.target.value })}
            className="min-w-0 w-full rounded-md border p-2"
          />
        </label>
      </div>

      <label className="block space-y-2">
        <span className="block text-sm font-medium">{t("timezoneInput")}</span>
        <input
          aria-describedby={`${fieldId}-timezone-help${preview.error ? " " + fieldId + "-error" : ""}`} aria-invalid={Boolean(preview.error)} list={`${fieldId}-zones`} value={draft.timezone}
          onChange={(event) => update({ timezone: event.target.value })}
          placeholder="Asia/Ho_Chi_Minh"
          className="min-w-0 w-full rounded-md border p-2"
        />
      </label>

      <datalist id={`${fieldId}-zones`}>{zones.map(zone => <option key={zone} value={zone} />)}</datalist>
      <p id={`${fieldId}-timezone-help`} className="text-xs text-muted-foreground">{t("selectTimezone")} {t("dstHelp")}</p>
      <fieldset className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
        <legend className="font-medium">{t("weeklySlots")}</legend>

        {draft.slots.map((slot, index) => (
          <div
            key={index} role="group" aria-label={t("slotLabel", { index: index + 1 })}
            className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-4"
          >
            <label className="space-y-1">
              <span id={`${fieldId}-weekday-${index}`} className="block text-xs">{t("weekday")}</span>
              <select
                aria-labelledby={`${fieldId}-weekday-${index}`}
                value={slot.weekday}
                onChange={(event) =>
                  updateSlot(index, "weekday", Number(event.target.value))
                }
                className="min-w-0 w-full rounded-md border p-2"
              >
                {weekdays.map((day, i) => (
                  <option key={day} value={i + 1}>
                    {t(`weekdayName.${day}`)}
                  </option>
                ))}
              </select>
            </label>

            {(["startTime", "endTime"] as const).map((field) => (
              <label key={field} className="space-y-1">
                <span className="block text-xs">
                  {field === "startTime" ? t("start") : t("end")}
                </span>
                <input
                  type="time"
                  value={slot[field]}
                  onChange={(event) =>
                    updateSlot(index, field, event.target.value)
                  }
                  className="min-w-0 w-full rounded-md border p-2"
                />
              </label>
            ))}

            <button
              type="button"
              aria-label={t("removeSlot", { index: index + 1 })}
              onClick={() =>
                update({
                  slots: draft.slots.filter((_, i) => i !== index),
                })
              }
              className="rounded-md border px-3 py-2 text-sm"
            >{t("remove")}</button>
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
        >{t("addSlot")}</button>
      </fieldset>

      <section
        aria-label={t("previewRegion")}
        className="space-y-2 rounded-md border p-4"
      >
        <h3 className="font-medium">{t("preview")}</h3>

        {preview.error ? (
          <p role="alert" id={`${fieldId}-error`} className="text-sm text-red-600">
            {t(`errors.${preview.error}`)}
          </p>
        ) : preview.occurrences.length === 0 ? (
          <p className="text-sm">{t("errors.empty")}</p>
        ) : (
          <>
            <p className="text-sm">
              {t("previewCount", { count: preview.occurrences.length })}
            </p>

            <ul className="space-y-1 text-sm">
              {preview.occurrences.slice(0, 8).map((session) => (
                <li key={session.occurrenceKey}>
                  {formatStudyDate(session.localDate, locale)} · {session.localStartTime}–
                  {session.localEndTime}
                </li>
              ))}
            </ul>

            {preview.occurrences.length > 8 && (
              <p className="text-xs opacity-70">{t("firstEight")}</p>
            )}
          </>
        )}
      </section>

      <button
        type="button"
        disabled={!canContinue || !onContinue}
        onClick={() => onContinue?.(draft)}
        className="rounded-md border px-4 py-2 disabled:opacity-50"
      >{t("continue")}</button>
    </section>
  );
}
