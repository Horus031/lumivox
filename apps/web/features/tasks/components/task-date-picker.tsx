"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { vi, enUS } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Dispatch, SetStateAction, useId, useState } from "react";

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
  const locale = useLocale();
  const [open, setOpen] = useState(false);

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
    setOpen(false);
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
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${id}-date`}>{t("fields.dueDate")}</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" id={`${id}-date`} disabled={disabled} className="w-full justify-start font-normal">
              <CalendarDays aria-hidden="true" />
              <span className="min-w-0 truncate">{dueAt ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(dueAt) : t("selectDate")}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden p-0" align="start">
            <Calendar mode="single" selected={dueAt} defaultMonth={dueAt} locale={locale === "vi" ? vi : enUS}
              formatters={{ formatMonthDropdown: (month) => new Intl.DateTimeFormat(locale, { month: "short" }).format(month) }}
              captionLayout="dropdown" onSelect={handleDateSelect} />
          </PopoverContent>
        </Popover>
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${id}-time`}>{t("fields.dueTime")}</Label>
        <Input type="time" id={`${id}-time`} step={1} value={dueTime} disabled={disabled}
          onChange={(event) => handleTimeChange(event.target.value)}
          className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden" />
      </div>
    </div>
  );
}
