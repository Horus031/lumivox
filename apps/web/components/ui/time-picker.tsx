"use client";

import { useId, useState } from "react";
import { Clock } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

const times = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, "0");
  return `${hour}:${index % 2 === 0 ? "00" : "30"}`;
});

type TimePickerProps = {
  label: string;
  pickerLabel: string;
  value: string;
  onChange: (time: string) => void;
  disabled?: boolean;
};

export function TimePicker({ label, pickerLabel, value, onChange, disabled }: TimePickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex min-w-0">
        <Input
          id={id}
          type="text"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="HH:mm"
          maxLength={5}
          autoComplete="off"
          spellCheck={false}
          className="rounded-e-none tabular-nums focus-visible:z-10"
        />
        <Select
          open={open && !disabled}
          onOpenChange={setOpen}
          value={times.includes(value) ? value : ""}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger
            aria-label={pickerLabel}
            className="-ms-px w-touch shrink-0 justify-center rounded-s-none px-0 hover:bg-muted focus-visible:z-10 sm:w-control [&>svg:last-child]:hidden"
          >
            <Clock aria-hidden="true" />
          </SelectTrigger>
          {open && !disabled && (
            <SelectContent align="end" position="popper" className="max-h-60 min-w-24">
              {times.map((time) => (
                <SelectItem key={time} value={time} className="tabular-nums">
                  {time}
                </SelectItem>
              ))}
            </SelectContent>
          )}
        </Select>
      </div>
    </div>
  );
}
