"use client";

import { type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { DatePicker } from "@/components/ui/date-picker";

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
  const date = type === "start" ? startDate : targetDate;
  const setDate = type === "start" ? setStartDate : type === "target" ? setTargetDate : undefined;
  if (!setDate) return null;

  return <DatePicker label={t(type === "start" ? "fields.startDate" : "fields.targetDate")} value={date} onChange={setDate} disabled={disabled} placeholder={t("selectDate")} />;
}
