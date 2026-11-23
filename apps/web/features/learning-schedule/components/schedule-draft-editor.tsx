"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { formatLocalDate, parseLocalDate } from "@/lib/local-date";

import { generateStudyOccurrences, type StudyScheduleInput } from "../schedule-engine";
import { ScheduleValidationError, formatStudyDate } from "../schedule-presentation";

type Props = {
  initialValue: StudyScheduleInput;
  disabled?: boolean;
  onContinue?: (draft: StudyScheduleInput) => void;
  onCancel?: () => void;
  cancelDisabled?: boolean;
};

const weekdays = [1, 2, 3, 4, 5, 6, 7];

export function ScheduleDraftEditor({
  initialValue,
  disabled,
  onContinue,
  onCancel,
  cancelDisabled = disabled,
}: Props) {
  const t = useTranslations("learningSchedule");
  const locale = useLocale();
  const fieldId = useId();
  const zones = useMemo(
    () => Array.from(new Set(["UTC", "Asia/Ho_Chi_Minh", ...Intl.supportedValuesOf("timeZone")])),
    [],
  );
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
      slots: current.slots.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot)),
    }));
  };

  const canContinue = !preview.error && preview.occurrences.length > 0;
  const invalidDates = preview.error === "invalidDate" || preview.error === "dateRange";

  return (
    <section aria-label={t("editor")} className="@container min-w-0 space-y-card">
      <div className="grid gap-card @md:grid-cols-2">
        {(["startsOn", "endsOn"] as const).map((field) => (
          <DatePicker
            key={field}
            label={field === "startsOn" ? t("startDate") : t("endDate")}
            value={parseLocalDate(draft[field])}
            onChange={(date) => update({ [field]: formatLocalDate(date) })}
            disabled={disabled}
            required
            aria-invalid={invalidDates}
            aria-describedby={invalidDates ? `${fieldId}-error` : undefined}
          />
        ))}
      </div>

      <Field>
        <FieldLabel htmlFor={`${fieldId}-timezone`}>{t("timezoneInput")}</FieldLabel>
        <Input
          id={`${fieldId}-timezone`}
          aria-describedby={`${fieldId}-timezone-help${preview.error ? " " + fieldId + "-error" : ""}`}
          aria-invalid={Boolean(preview.error)}
          list={`${fieldId}-zones`}
          value={draft.timezone}
          disabled={disabled}
          onChange={(event) => update({ timezone: event.target.value })}
          placeholder="Asia/Ho_Chi_Minh"
        />
        <datalist id={`${fieldId}-zones`}>
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <FieldDescription id={`${fieldId}-timezone-help`} className="text-caption">
          {t("selectTimezone")} {t("dstHelp")}
        </FieldDescription>
      </Field>
      <fieldset className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
        <FieldLegend variant="label">{t("weeklySlots")}</FieldLegend>

        {draft.slots.map((slot, index) => (
          <div
            key={index}
            role="group"
            aria-label={t("slotLabel", { index: index + 1 })}
            className="grid grid-cols-1 items-end gap-3 rounded-md border bg-muted/30 p-3 @md:grid-cols-2 @xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <Field className="min-w-0">
              <FieldLabel htmlFor={`${fieldId}-weekday-${index}`}>
                {t("weekday")}
              </FieldLabel>
              <Select
                disabled={disabled}
                value={String(slot.weekday)}
                onValueChange={(value) => updateSlot(index, "weekday", Number(value))}
              >
                <SelectTrigger id={`${fieldId}-weekday-${index}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {weekdays.map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      {t(`weekdayName.${day}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {(["startTime", "endTime"] as const).map((field) => {
              const isStart = field === "startTime";
              return (
                <TimePicker
                  key={field}
                  label={isStart ? t("start") : t("end")}
                  pickerLabel={isStart ? t("pickStartTime") : t("pickEndTime")}
                  value={slot[field]}
                  onChange={(time) => updateSlot(index, field, time)}
                  disabled={disabled}
                />
              );
            })}

            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              aria-label={t("removeSlot", { index: index + 1 })}
              onClick={() =>
                update({
                  slots: draft.slots.filter((_, i) => i !== index),
                })
              }
              className="justify-self-start @md:justify-self-end"
            >
              {t("remove")}
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || draft.slots.length >= 21}
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
        >
          {t("addSlot")}
        </Button>
      </fieldset>

      <section aria-label={t("previewRegion")} className="space-y-2 rounded-md border p-card">
        <h3 className="text-label font-medium">{t("preview")}</h3>

        {preview.error ? (
          <FieldError id={`${fieldId}-error`}>
            {t(`errors.${preview.error}`)}
          </FieldError>
        ) : preview.occurrences.length === 0 ? (
          <p className="text-sm">{t("errors.empty")}</p>
        ) : (
          <>
            <p className="text-sm">{t("previewCount", { count: preview.occurrences.length })}</p>

            <ul className="space-y-1 text-sm">
              {preview.occurrences.slice(0, 8).map((session) => (
                <li key={session.occurrenceKey}>
                  {formatStudyDate(session.localDate, locale)} · {session.localStartTime}–
                  {session.localEndTime}
                </li>
              ))}
            </ul>

            {preview.occurrences.length > 8 && (
              <p className="text-caption text-muted-foreground">{t("firstEight")}</p>
            )}
          </>
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" disabled={cancelDisabled} onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
        <Button
          type="button"
          disabled={disabled || !canContinue || !onContinue}
          onClick={() => onContinue?.(draft)}
        >
          {t("continue")}
        </Button>
      </div>
    </section>
  );
}
