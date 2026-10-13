"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calibrationTotal, DEFAULT_PBI_WEIGHTS, isCalibrationValid, type ProfileCalibrationValues } from "../profile-calibration";

const TIMEZONES = ["Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"];
const WEIGHT_FIELDS = [
  { key: "taskCompletionWeight", label: "taskCompletion" },
  { key: "focusQualityWeight", label: "focusQuality" },
  { key: "deadlineAdherenceWeight", label: "deadlineAdherence" },
  { key: "goalMomentumWeight", label: "goalMomentum" },
  { key: "consistencyWeight", label: "consistency" },
] as const;

type Props = {
  values: ProfileCalibrationValues;
  onChange: (patch: Partial<ProfileCalibrationValues>) => void;
  disabled?: boolean;
};

export function ProfileCalibrationFields({ values, onChange, disabled }: Props) {
  const t = useTranslations("settings.form");
  const locale = useLocale();
  const id = useId();
  const valid = isCalibrationValid(values);
  const formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const timezones = TIMEZONES.includes(values.timezone) ? TIMEZONES : [values.timezone, ...TIMEZONES];

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-section">
      <section className="min-w-0 border-t border-border pt-card">
        <h2 className="text-section font-semibold">{t("profile.title")}</h2>
        <div className="mt-card grid min-w-0 gap-card sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label htmlFor={`${id}-name`}>{t("profile.fullName")}</Label>
            <Input id={`${id}-name`} autoComplete="name" value={values.fullName} required maxLength={120} onChange={(event) => onChange({ fullName: event.target.value })} />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor={`${id}-timezone`}>{t("profile.timezone")}</Label>
            <Select value={values.timezone} disabled={disabled} onValueChange={(timezone) => onChange({ timezone })}>
              <SelectTrigger id={`${id}-timezone`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{timezones.map((timezone) => <SelectItem key={timezone} value={timezone}>{timezone}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </section>
      <section className="min-w-0 border-t border-border pt-card">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-section font-semibold">{t("pbi.title")}</h2>
          <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={() => onChange(DEFAULT_PBI_WEIGHTS)} aria-label={t("pbi.reset")} title={t("pbi.reset")}><RotateCcw aria-hidden="true" /></Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-body">
          <p className="font-medium">{t("pbi.totalWeight")}</p>
          <output role="status" className={`font-semibold tabular-nums ${valid ? "text-success" : "text-danger"}`}>{formatter.format(calibrationTotal(values))} / {formatter.format(1)}</output>
        </div>
        <p id={`${id}-total-help`} className="mt-1 text-caption text-muted-foreground">{t("pbi.totalHelp")}</p>
        <div className="mt-card divide-y divide-border">
          {WEIGHT_FIELDS.map(({ key, label }) => (
            <div key={key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 py-3">
              <div className="min-w-0">
                <Label htmlFor={`${id}-${key}`} className="text-body [overflow-wrap:anywhere]">{t(`weights.${label}.label`)}</Label>
                <p id={`${id}-${key}-help`} className="mt-1 text-caption text-secondary-text [overflow-wrap:anywhere]">{t(`weights.${label}.description`)}</p>
              </div>
              <Input id={`${id}-${key}`} type="number" required min={0} max={1} step={0.01} value={values[key]}
                aria-describedby={`${id}-${key}-help ${id}-total-help`}
                onChange={(event) => onChange({ [key]: Number(event.target.value) })} />
            </div>
          ))}
        </div>
      </section>
    </fieldset>
  );
}
