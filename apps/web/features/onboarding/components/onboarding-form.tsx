"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PbiWeightProfile, Profile } from "@/features/profiles/profile.types";
import { initialCalibration, isCalibrationValid, type ProfileCalibrationValues } from "@/features/profiles/profile-calibration";
import { ProfileCalibrationFields } from "@/features/profiles/components/profile-calibration-fields";
import { completeOnboardingAction } from "../onboarding.actions";

type Props = { profile: Profile; weights: PbiWeightProfile };

export function OnboardingForm({ profile, weights }: Props) {
  const t = useTranslations("onboarding");

  const [values, setValues] = useState(() => initialCalibration(profile, weights));
  const [isPending, startTransition] = useTransition();
  function change(patch: Partial<ProfileCalibrationValues>) { setValues((current) => ({ ...current, ...patch })); }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || !isCalibrationValid(values)) return;
    startTransition(async () => {
      const result = await completeOnboardingAction(values);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={isPending} className="min-w-0 space-y-section">
      <ProfileCalibrationFields values={values} onChange={change} disabled={isPending} />
      <div className="flex justify-end border-t border-border pt-card">
        <Button type="submit" disabled={isPending || !isCalibrationValid(values)}>
          <Check aria-hidden="true" />{isPending ? t("completing") : t("complete")}
        </Button>
      </div>
    </form>
  );
}
