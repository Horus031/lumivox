"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
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
          <h2 className="text-xl font-semibold">Profile setup</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Tell Lumivox who you are and which timezone should be used for
            behavioural analytics.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-sm font-medium">
              Full name
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
            <Label className="mb-1.5 block text-sm font-medium">Timezone</Label>

            <Select
              value={timezone ?? ""}
              onValueChange={(event) => setTimezone(event)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Timezone" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Timezone</SelectLabel>
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
            <h2 className="text-xl font-semibold">Personalize your PBI</h2>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600">
              Adjust how strongly each behavioural dimension contributes to your
              Personalized Productive Behaviour Index.
            </p>
          </div>

          <Button
            variant={"outline"}
            type="button"
            onClick={resetToDefaultWeights}
            className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-surface"
          >
            Reset to academic default
          </Button>
        </div>

        <div className="mb-6 rounded-2xl border bg-surface p-4">
          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
            <p className="text-sm font-medium">Current total weight</p>

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
            The total must equal exactly 1.00 before onboarding can be
            completed.
          </p>
        </div>

        <div className="space-y-5">
          <WeightInput
            label="Task Completion Rate"
            description="How strongly completed tasks should influence your PBI."
            value={taskCompletionWeight}
            onChange={setTaskCompletionWeight}
          />

          <WeightInput
            label="Focus Quality Score"
            description="How strongly focused study sessions and low distraction should matter."
            value={focusQualityWeight}
            onChange={setFocusQualityWeight}
          />

          <WeightInput
            label="Deadline Adherence Score"
            description="How strongly meeting deadlines should contribute."
            value={deadlineAdherenceWeight}
            onChange={setDeadlineAdherenceWeight}
          />

          <WeightInput
            label="Goal Momentum Score"
            description="How strongly progress growth across goals should matter."
            value={goalMomentumWeight}
            onChange={setGoalMomentumWeight}
          />

          <WeightInput
            label="Consistency Score"
            description="How strongly regular learning behaviour should affect your PBI."
            value={consistencyWeight}
            onChange={setConsistencyWeight}
          />
        </div>
      </section>

      <section className="rounded-2xl border bg-background p-6 shadow-sm">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Appearance
          </p>

          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            Theme preference
          </h2>

          <p className="mt-2 max-w-3xl text-secondary">
            Choose between light mode, dark mode, or follow your system
            preference.
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
          {isPending ? "Saving settings..." : "Save settings"}
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
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium">{label}</p>
          <p className="mt-1 text-sm text-secondary">{description}</p>
        </div>

        <div className="w-full md:w-56">
          <label className="mb-1 block text-sm font-medium">Weight</label>

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
