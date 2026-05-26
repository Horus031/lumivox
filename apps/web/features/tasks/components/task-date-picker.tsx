"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { ChevronDownIcon } from "lucide-react";
import { Dispatch, SetStateAction, useState } from "react";

type TaskDatePickerProps = {
  dueAt: Date | undefined;
  setDueAt: Dispatch<SetStateAction<Date | undefined>>;
  dueTime: string;
  setDueTime: Dispatch<SetStateAction<string>>;
};

export function TaskDatePicker(props: TaskDatePickerProps) {
  const { dueAt, setDueAt, dueTime, setDueTime } = props;
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
    <FieldGroup className="mx-auto max-w-xs flex-row">
      <Field className="gap-1">
        <FieldLabel htmlFor="date-picker-optional">Due date</FieldLabel>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              id="date-picker-optional"
              className="w-32 h-11 font-normal hover:text-primary-foreground"
            >
              {dueAt ? format(dueAt, "PPP") : "Select date"}
              <ChevronDownIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              selected={dueAt}
              captionLayout="dropdown"
              defaultMonth={dueAt}
              onSelect={handleDateSelect}
            />
          </PopoverContent>
        </Popover>
      </Field>
      <Field className="w-32 gap-1">
        <FieldLabel htmlFor="time-picker-optional">Due time</FieldLabel>
        <Input
          type="time"
          id="time-picker-optional"
          step={1}
          value={dueTime}
          onChange={(event) => handleTimeChange(event.target.value)}
          className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        />
      </Field>
    </FieldGroup>
  );
}
