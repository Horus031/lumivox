"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoalOption } from "@/features/goals/goal.types";
import { searchWorkspaceGoals } from "../workspace-goal-search.action";

export function WorkspaceGoalPicker({
  id,
  name,
  value,
  onChange,
  goals,
  emptyOptions,
  disabled,
}: {
  id: string;
  name?: string;
  value: string;
  onChange?: (value: string) => void;
  goals: GoalOption[];
  emptyOptions: ReactNode;
  disabled?: boolean;
}) {
  const t = useTranslations("workspace.preview");
  const [selection, setSelection] = useState(value);
  const [selectedGoal, setSelectedGoal] = useState(goals.find((goal) => goal.id === value));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GoalOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const matches = results ?? goals;
  const selectedId = onChange ? value : selection;
  const options = selectedGoal?.id === selectedId && !matches.some((goal) => goal.id === selectedId)
    ? [selectedGoal, ...matches]
    : matches;

  function search() {
    setFailed(false);
    startTransition(async () => {
      try {
        setResults(await searchWorkspaceGoals(query));
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          aria-label={t("goalSearch")}
          placeholder={t("goalSearch")}
          value={query}
          maxLength={120}
          disabled={disabled || pending}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              search();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={search} disabled={disabled || pending}>
          {pending ? t("searching") : t("search")}
        </Button>
      </div>
      <select
        id={id}
        name={name}
        className="w-full rounded-md border bg-background px-2 py-2 text-sm"
        value={selectedId}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          setSelection(next);
          setSelectedGoal(options.find((goal) => goal.id === next));
          onChange?.(next);
        }}
      >
        {emptyOptions}
        {options.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
      </select>
      <p className="text-xs text-muted-foreground" role="status">
        {failed ? t("goalSearchError") : results && t("goalResults", { count: results.length })}
      </p>
    </div>
  );
}
