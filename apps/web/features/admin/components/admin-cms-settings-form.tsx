"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateAdminCmsSettingAction } from "@/features/admin/admin-settings.actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

type CmsSetting = { key: string; value: unknown; description: string | null; updated_at: string };
type SettingKey = Parameters<typeof updateAdminCmsSettingAction>[0]["key"];
function getSetting<T>(settings: CmsSetting[], key: SettingKey, fallback: T): T {
  const setting = settings.find((item) => item.key === key);
  return setting ? setting.value as T : fallback;
}

function NumericSetting({ label, value, disabled, onSave }: { label: string; value: number; disabled: boolean; onSave: (value: number, onFailure: () => void) => void }) {
  const id = useId();
  const t = useTranslations("admin.settings.form");
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={0} step={1} value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onBlur={(event) => {
        if (disabled) return;
        const number = event.currentTarget.valueAsNumber;
        if (!event.currentTarget.validity.valid || !Number.isFinite(number) || draft === "") {
          setDraft(String(value)); toast.error(t("invalidNumber")); return;
        }
        if (number !== value) onSave(number, () => setDraft(String(value)));
      }} />
    </div>
  );
}

export function AdminCmsSettingsForm({ settings }: { settings: CmsSetting[] }) {
  const router = useRouter();
  const t = useTranslations("admin.settings.form");
  const id = useId();
  const [isPending, startTransition] = useTransition();
  function updateSetting(key: SettingKey, value: boolean | number | string, onFailure?: () => void) {
    if (isPending) return;
    startTransition(async () => {
      const result = await updateAdminCmsSettingAction({ key, value });
      if (!result.success) { onFailure?.(); toast.error(result.message); router.refresh(); return; }
      toast.success(result.message); router.refresh();
    });
  }
  const flags = [
    { key: "global_leaderboard_enabled", path: "globalLeaderboard", value: getSetting(settings, "global_leaderboard_enabled", true) },
    { key: "group_leaderboard_enabled", path: "groupLeaderboard", value: getSetting(settings, "group_leaderboard_enabled", true) },
    { key: "maintenance_mode_enabled", path: "maintenanceMode", value: getSetting(settings, "maintenance_mode_enabled", false) },
  ] as const;
  const topK = getSetting(settings, "default_rag_top_k", 5);
  const prompt = getSetting(settings, "default_rag_prompt_variant", "grounded_rule");

  return (
    <fieldset disabled={isPending} aria-busy={isPending} className="min-w-0 space-y-section">
      <legend className="sr-only">{t("label")}</legend>
      <section className="space-y-3 border-t border-border pt-card">
        <h2 className="text-section font-semibold text-foreground">{t("featureFlags.title")}</h2>
        <div className="divide-y divide-border">
          {flags.map(({ key, path, value }) => (
            <div key={key} className="flex min-w-0 items-center justify-between gap-3 py-3">
              <div className="min-w-0 [overflow-wrap:anywhere]"><Label htmlFor={`${id}-${key}`}>{t(`featureFlags.${path}.title`)}</Label><p id={`${id}-${key}-help`} className="mt-1 text-caption text-muted-foreground">{t(`featureFlags.${path}.description`)}</p></div>
              <Label htmlFor={`${id}-${key}`} className="flex min-h-touch min-w-touch shrink-0 cursor-pointer items-center justify-center">
                <Checkbox id={`${id}-${key}`} aria-label={t(`featureFlags.${path}.title`)} aria-describedby={`${id}-${key}-help`} checked={value} disabled={isPending} onCheckedChange={(checked) => updateSetting(key, checked === true)} />
              </Label>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3 border-t border-border pt-card">
        <h2 className="text-section font-semibold text-foreground">{t("ragDefaults.title")}</h2>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor={`${id}-top-k`}>{t("ragDefaults.defaultTopK")}</Label>
            <Select value={String(topK)} disabled={isPending} onValueChange={(value) => updateSetting("default_rag_top_k", Number(value))}>
              <SelectTrigger id={`${id}-top-k`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectLabel>{t("ragDefaults.defaultTopK")}</SelectLabel>{[3, 5, 7].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor={`${id}-prompt`}>{t("ragDefaults.defaultPromptVariant")}</Label>
            <Select value={prompt} disabled={isPending} onValueChange={(value) => updateSetting("default_rag_prompt_variant", value)}>
              <SelectTrigger id={`${id}-prompt`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectLabel>{t("ragDefaults.defaultPromptVariant")}</SelectLabel><SelectItem value="grounded_rule">{t("ragDefaults.promptVariants.groundedRule")}</SelectItem><SelectItem value="no_rule">{t("ragDefaults.promptVariants.noRule")}</SelectItem></SelectGroup></SelectContent>
            </Select>
          </div>
        </div>
      </section>
      <section className="space-y-3 border-t border-border pt-card">
        <h2 className="text-section font-semibold text-foreground">{t("weeklyChallenge.title")}</h2>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <NumericSetting label={t("weeklyChallenge.defaultFocusMinutes")} value={getSetting(settings, "weekly_challenge_default_focus_minutes", 300)} disabled={isPending} onSave={(value, fail) => updateSetting("weekly_challenge_default_focus_minutes", value, fail)} />
          <NumericSetting label={t("weeklyChallenge.defaultCompletedTasks")} value={getSetting(settings, "weekly_challenge_default_completed_tasks", 10)} disabled={isPending} onSave={(value, fail) => updateSetting("weekly_challenge_default_completed_tasks", value, fail)} />
        </div>
      </section>
    </fieldset>
  );
}
