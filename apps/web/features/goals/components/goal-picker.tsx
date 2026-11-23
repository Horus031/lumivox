"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GoalPageSearch } from "./goal-page-search";
import type { GoalOption } from "../goal.types";

export function GoalPicker({ id, value, onChange, disabled }: {
  id: string;
  value: GoalOption | null;
  onChange: (goal: GoalOption | null) => void;
  disabled: boolean;
}) {
  const t = useTranslations("tasks.form");
  const [open, setOpen] = useState(false);

  function select(goal: GoalOption | null) {
    onChange(goal ? { id: goal.id, title: goal.title } : null);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" aria-describedby={`${id}-value`} disabled={disabled} variant="outline" className="w-full min-w-0 justify-between font-normal">
          <span id={`${id}-value`} className="truncate">{value?.title ?? t("noGoal")}</span>
          <ChevronsUpDown aria-hidden="true" className="size-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={t("fields.linkedGoal")} className="max-h-[var(--radix-popover-content-available-height)] w-[max(14rem,var(--radix-popover-trigger-width))] max-w-[calc(100vw-2rem)] space-y-2 overflow-y-auto p-2">
        <GoalPageSearch renderItem={(goal) => (
          <Button type="button" variant="ghost" aria-pressed={goal.id === value?.id} className="w-full min-w-0 justify-between font-normal" onClick={() => select(goal)}>
            <span className="truncate">{goal.title}</span>
            {goal.id === value?.id && <Check aria-hidden="true" className="size-4" />}
          </Button>
        )} />
        <Button type="button" variant="ghost" aria-pressed={!value} className="w-full justify-start font-normal" onClick={() => select(null)}>
          {t("noGoal")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
