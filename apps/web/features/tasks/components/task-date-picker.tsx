"use client";

import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import { Dispatch, SetStateAction, useId } from "react";

type TaskDatePickerProps = {
  disabled?: boolean;
  dueAt: Date | undefined;
  setDueAt: Dispatch<SetStateAction<Date | undefined>>;
  dueTime: string;
  setDueTime: Dispatch<SetStateAction<string>>;
};

export function TaskDatePicker(props: TaskDatePickerProps) {
  const t = useTranslations("tasks.form");
  const { dueAt, setDueAt, dueTime, setDueTime, disabled } = props;
  const id = useId();

  function handleDateSelect(date: Date | undefined) {
    if (!date) {
      setDueAt(undefined);
      return;
    }

    const [hours = 0, minutes = 0, seconds = 0] = dueTime
      .split(":")
      .map((value) => Number(value));

    const nextDate = new Date(date);
    nextDate.setHours(hours, minutes, seconds, 0);
    setDueAt(nextDate);
  }

  function handleTimeChange(value: string) {
    setDueTime(value);

    if (!dueAt) {
      return;
    }

    const [hours = 0, minutes = 0, seconds = 0] = value
      .split(":")
      .map((part) => Number(part));

    const nextDate = new Date(dueAt);
    nextDate.setHours(hours, minutes, seconds, 0);
    setDueAt(nextDate);
  }

  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
      <DatePicker id={`${id}-date`} label={t("fields.dueDate")} value={dueAt} onChange={handleDateSelect} disabled={disabled} placeholder={t("selectDate")} />
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${id}-time`}>{t("fields.dueTime")}</Label>
        <Input type="time" id={`${id}-time`} step={1} value={dueTime} disabled={disabled}
          onChange={(event) => handleTimeChange(event.target.value)}
          className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden" />
      </div>
    </div>
  );
}
