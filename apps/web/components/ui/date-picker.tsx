"use client";

import { useId, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { enUS, vi } from "date-fns/locale";
import { startOfDay } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatLocalDate } from "@/lib/local-date";

type DatePickerProps = {
  id?: string;
  label: string;
  value?: Date;
  onChange: (date: Date | undefined) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
};

/** Shared local-date field. Dates stay in local time; callers own date/time serialization. */
export function DatePicker({ id, label, value, onChange, disabled, required = false, placeholder, minDate, maxDate, className }: DatePickerProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const locale = useLocale();
  const t = useTranslations("common.datePicker");
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value ?? new Date());
  const trigger = useRef<HTMLButtonElement>(null);
  const today = startOfDay(new Date());
  const min = minDate ? startOfDay(minDate) : undefined;
  const max = maxDate ? startOfDay(maxDate) : undefined;
  const year = today.getFullYear();
  const startMonth = min ?? new Date(Math.min(year - 100, value?.getFullYear() ?? year), 0);
  const endMonth = max ?? new Date(Math.max(year + 100, value?.getFullYear() ?? year), 11);
  const unavailable = (date: Date) => Boolean((min && date < min) || (max && date > max));

  function select(date: Date | undefined) {
    if (disabled || (!date && required) || (date && unavailable(date))) return;
    onChange(date);
    setOpen(false);
  }

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <Label htmlFor={fieldId}>{label}</Label>
      <Popover open={open && !disabled} onOpenChange={(nextOpen) => {
        if (nextOpen) setMonth(value ?? today);
        setOpen(nextOpen);
      }}>
        <PopoverTrigger asChild>
          <Button ref={trigger} id={fieldId} type="button" variant="outline" disabled={disabled}
            aria-label={`${label}: ${value ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(value) : placeholder ?? t("placeholder")}`}
            className={cn("w-full justify-start gap-2 font-normal", !value && "text-muted-foreground")}>
            <CalendarDays className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 truncate">{value ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(value) : placeholder ?? t("placeholder")}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label={label} className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-border p-0 shadow-xl">
          <Calendar mode="single" selected={value} month={month} onMonthChange={setMonth}
            locale={locale === "vi" ? vi : enUS} captionLayout="dropdown" navLayout="after" fixedWeeks
            startMonth={startMonth} endMonth={endMonth} disabled={unavailable} required={required}
            labels={{ labelMonthDropdown: () => t("month"), labelYearDropdown: () => t("year"), labelPrevious: () => t("previousMonth"), labelNext: () => t("nextMonth") }}
            formatters={{ formatMonthDropdown: (date) => new Intl.DateTimeFormat(locale, { month: "short" }).format(date) }}
            onSelect={select} autoFocus className="[--cell-size:2.25rem] sm:[--cell-size:2.5rem]" />
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 p-2">
            <Button type="button" variant="ghost" size="sm" disabled={unavailable(today)} onClick={() => select(today)}>{t("today")}</Button>
            {!required ? <Button type="button" variant="ghost" size="sm" disabled={!value} onClick={() => select(undefined)} className="text-muted-foreground">{t("clear")}</Button> : null}
          </div>
        </PopoverContent>
      </Popover>
      {required ? <input type="text" required disabled={disabled} value={formatLocalDate(value)} onChange={() => {}} tabIndex={-1} aria-hidden="true" className="sr-only"
        onInvalid={(event) => { event.preventDefault(); trigger.current?.focus(); setOpen(true); }} /> : null}
    </div>
  );
}
