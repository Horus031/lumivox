"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateValue } from "@/lib/utils/date";
import { ChevronDownIcon } from "lucide-react";
import { Dispatch, SetStateAction, useState } from "react";

type GoalDatePickerProps = {
  type: string;
  startDate?: Date | undefined;
  setStartDate?: Dispatch<SetStateAction<Date | undefined>>;
  targetDate?: Date | undefined;
  setTargetDate?: Dispatch<SetStateAction<Date | undefined>>;
};

export function GoalDatePicker(props: GoalDatePickerProps) {
  const { type, startDate, setStartDate, targetDate, setTargetDate } = props;
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  if (type === "start" && setStartDate)
    return (
      <Field>
        <FieldLabel htmlFor="date">Start date</FieldLabel>
        <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="text-left! hover:bg-foreground/10">
              {formatDateValue(startDate) || "Select date"}
              <ChevronDownIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              defaultMonth={startDate}
              captionLayout="dropdown"
              onSelect={(date) => {
                setStartDate(date);
                setStartDateOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </Field>
    );

  if (type === "target" && setTargetDate)
    return (
      <Field>
        <FieldLabel htmlFor="date">Target date</FieldLabel>
        <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="hover:bg-foreground/10">
              {formatDateValue(targetDate) || "Select date"}
              <ChevronDownIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              selected={targetDate}
              defaultMonth={targetDate}
              captionLayout="dropdown"
              onSelect={(date) => {
                setTargetDate(date);
                setEndDateOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </Field>
    );
}
