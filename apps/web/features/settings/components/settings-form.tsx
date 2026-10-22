"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PbiWeightProfile, Profile } from "@/features/profiles/profile.types";
import { initialCalibration, isCalibrationValid, type ProfileCalibrationValues } from "@/features/profiles/profile-calibration";
import { ProfileCalibrationFields } from "@/features/profiles/components/profile-calibration-fields";
import { ThemeToggle } from "@/features/theme/theme-toggle";
import { updateSettingsAction } from "../settings.actions";

type Props = { profile: Profile; weights: PbiWeightProfile };

export function SettingsForm({ profile, weights }: Props) {
  const t = useTranslations("settings.form");
  const router = useRouter();
  const [values, setValues] = useState(() => initialCalibration(profile, weights));
  const [isPending, startTransition] = useTransition();
  function change(patch: Partial<ProfileCalibrationValues>) { setValues((current) => ({ ...current, ...patch })); }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || !isCalibrationValid(values)) return;
    startTransition(async () => {
      const result = await updateSettingsAction(values);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={isPending} className="min-w-0 space-y-section">
      <ProfileCalibrationFields values={values} onChange={change} disabled={isPending} />
      <section className="min-w-0 border-t border-border pt-card">
        <h2 className="text-section font-semibold">{t("appearance.title")}</h2>
        <div className="mt-card max-w-md"><ThemeToggle disabled={isPending} /></div>
      </section>
      <div className="flex justify-end border-t border-border pt-card">
        <Button type="submit" disabled={isPending || !isCalibrationValid(values)}>
          <Save aria-hidden="true" />{isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
