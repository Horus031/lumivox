"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type {
  PbiWeightProfile,
  Profile,
} from "@/features/profiles/profile.types";
import { updateSettingsAction } from "../settings.actions";
import { ThemeToggle } from "@/features/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OnboardingFormProps = {
  profile: Profile;
  weights: PbiWeightProfile;
};

const commonTimezones = [
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

export function SettingsForm({ profile, weights }: OnboardingFormProps) {
  const t = useTranslations("settings.form");
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [timezone, setTimezone] = useState(
    profile.timezone || "Asia/Ho_Chi_Minh",
  );

  const [taskCompletionWeight, setTaskCompletionWeight] = useState(
    Number(weights.task_completion_weight),
  );
  const [focusQualityWeight, setFocusQualityWeight] = useState(
    Number(weights.focus_quality_weight),
  );
  const [deadlineAdherenceWeight, setDeadlineAdherenceWeight] = useState(
    Number(weights.deadline_adherence_weight),
  );
  const [goalMomentumWeight, setGoalMomentumWeight] = useState(
    Number(weights.goal_momentum_weight),
  );
  const [consistencyWeight, setConsistencyWeight] = useState(
    Number(weights.consistency_weight),
  );

  const totalWeight = useMemo(() => {
    return (
      taskCompletionWeight +
      focusQualityWeight +
      deadlineAdherenceWeight +
      goalMomentumWeight +
      consistencyWeight
    );
  }, [
    taskCompletionWeight,
    focusQualityWeight,
    deadlineAdherenceWeight,
    goalMomentumWeight,
    consistencyWeight,
  ]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await updateSettingsAction({
        fullName,
        timezone,
        taskCompletionWeight,
        focusQualityWeight,
        deadlineAdherenceWeight,
        goalMomentumWeight,
        consistencyWeight,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
    });
  }

  function resetToDefaultWeights() {
    setTaskCompletionWeight(0.3);
    setFocusQualityWeight(0.25);
    setDeadlineAdherenceWeight(0.25);
    setGoalMomentumWeight(0.1);
    setConsistencyWeight(0.1);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="rounded-2xl border bg-background p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-xl font-semibold">{t("profile.title")}</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {t("profile.description")}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-sm font-medium">
              {t("profile.fullName")}
            </Label>
            <Input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Vo Minh Nghia"
              required
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-sm font-medium">
              {t("profile.timezone")}
            </Label>

            <Select
              value={timezone ?? ""}
              onValueChange={(event) => setTimezone(event)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("profile.timezone")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{t("profile.timezone")}</SelectLabel>
                  {commonTimezones.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-background p-6 shadow-sm">
        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h2 className="text-xl font-semibold">{t("pbi.title")}</h2>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600">
              {t("pbi.description")}
            </p>
          </div>

          <Button
            variant={"outline"}
            type="button"
            onClick={resetToDefaultWeights}
            className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-surface"
          >
            {t("pbi.reset")}
          </Button>
        </div>

        <div className="mb-6 rounded-2xl border bg-surface p-4">
          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
            <p className="text-sm font-medium">{t("pbi.totalWeight")}</p>

            <p
              className={`text-lg font-bold ${
                Math.abs(totalWeight - 1) <= 0.0001
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              {totalWeight.toFixed(2)} / 1.00
            </p>
          </div>

          <p className="mt-2 text-sm text-neutral-600">
            {t("pbi.totalHelp")}
          </p>
        </div>

        <div className="space-y-5">
          <WeightInput
            label={t("weights.taskCompletion.label")}
            description={t("weights.taskCompletion.description")}
            value={taskCompletionWeight}
            onChange={setTaskCompletionWeight}
          />

          <WeightInput
            label={t("weights.focusQuality.label")}
            description={t("weights.focusQuality.description")}
            value={focusQualityWeight}
            onChange={setFocusQualityWeight}
          />

          <WeightInput
            label={t("weights.deadlineAdherence.label")}
            description={t("weights.deadlineAdherence.description")}
            value={deadlineAdherenceWeight}
            onChange={setDeadlineAdherenceWeight}
          />

          <WeightInput
            label={t("weights.goalMomentum.label")}
            description={t("weights.goalMomentum.description")}
            value={goalMomentumWeight}
            onChange={setGoalMomentumWeight}
          />

          <WeightInput
            label={t("weights.consistency.label")}
            description={t("weights.consistency.description")}
            value={consistencyWeight}
            onChange={setConsistencyWeight}
          />
        </div>
      </section>

      <section className="rounded-2xl border bg-background p-6 shadow-sm">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {t("appearance.eyebrow")}
          </p>

          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {t("appearance.title")}
          </h2>

          <p className="mt-2 max-w-3xl text-secondary">
            {t("appearance.description")}
          </p>
        </div>

        <div className="mt-5 max-w-md">
          <ThemeToggle />
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isPending || Math.abs(totalWeight - 1) > 0.0001}
          className="rounded-xl px-5 py-3 text-sm font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}

type WeightInputProps = {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
};

function WeightInput({
  label,
  description,
  value,
  onChange,
}: WeightInputProps) {
  const t = useTranslations("settings.form.weights");

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium">{label}</p>
          <p className="mt-1 text-sm text-secondary">{description}</p>
        </div>

        <div className="w-full md:w-56">
          <label className="mb-1 block text-sm font-medium">
            {t("weight")}
          </label>

          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
          />
        </div>
      </div>
    </div>
  );
}
