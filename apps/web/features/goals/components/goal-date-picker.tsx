"use client";

import { useId, useState, type Dispatch, type SetStateAction } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { vi, enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type GoalDatePickerProps = {
  type: string;
  startDate?: Date;
  setStartDate?: Dispatch<SetStateAction<Date | undefined>>;
  targetDate?: Date;
  setTargetDate?: Dispatch<SetStateAction<Date | undefined>>;
  disabled?: boolean;
};

export function GoalDatePicker({ type, startDate, setStartDate, targetDate, setTargetDate, disabled }: GoalDatePickerProps) {
  const t = useTranslations("goals.form");
  const locale = useLocale();
  const id = useId();
  const [open, setOpen] = useState(false);
  const date = type === "start" ? startDate : targetDate;
  const setDate = type === "start" ? setStartDate : type === "target" ? setTargetDate : undefined;
  if (!setDate) return null;

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{t(type === "start" ? "fields.startDate" : "fields.targetDate")}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" disabled={disabled} className="w-full justify-start font-normal">
            <CalendarDays aria-hidden="true" />
            <span className="min-w-0 truncate">{date ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(date) : t("selectDate")}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden p-0" align="start">
          <Calendar mode="single" selected={date} defaultMonth={date} locale={locale === "vi" ? vi : enUS} captionLayout="dropdown"
            formatters={{ formatMonthDropdown: (month) => new Intl.DateTimeFormat(locale, { month: "short" }).format(month) }}
            onSelect={(nextDate) => { setDate(nextDate); setOpen(false); }} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
