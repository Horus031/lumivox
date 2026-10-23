"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Play, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createFocusV2SessionAction } from "../focus-v2.actions";
import { saveFocusV2PreferencesAction } from "../focus-v2-preferences.actions";
import {
  buildFocusV2Schedule,
  focusV2ConfigSchema,
  type FocusV2SegmentKind,
} from "../focus-v2-config.schemas";
import {
  focusV2PreferencesSchema,
  isMatchingFocusV2Preferences,
  type FocusV2Preferences,
} from "../focus-v2-preferences";
import {
  FOCUS_V2_PRESETS,
  FOCUS_V2_PRESET_ORDER,
  type FocusV2PresetName,
} from "../focus-v2-presets";

type TaskOption = { id: string; title: string };
type NumberField =
  | "focusMinutes" | "shortBreakMinutes" | "longBreakMinutes"
  | "roundCount" | "longBreakEvery";
type BooleanField = "autoStartBreaks" | "autoStartFocus";

type Props = {
  tasks: TaskOption[];
  initialPreferences: FocusV2Preferences;
};

const numericSettings: Array<{
  key: NumberField;
  min: number;
  max: number;
}> = [
  { key: "focusMinutes", min: 5, max: 120 },
  { key: "shortBreakMinutes", min: 1, max: 30 },
  { key: "longBreakMinutes", min: 5, max: 60 },
  { key: "roundCount", min: 1, max: 8 },
  { key: "longBreakEvery", min: 2, max: 8 },
];

export function FocusV2SessionBuilder({ tasks, initialPreferences }: Props) {
  const t = useTranslations("focus.builder");
  const router = useRouter();
  const uniqueId = useId();
  const [preferences, setPreferences] = useState<FocusV2Preferences>(initialPreferences);
  const [taskId, setTaskId] = useState("");
  const [forceCustom, setForceCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const busy = saving || starting;

  const activePreset = forceCustom ? "custom" : (FOCUS_V2_PRESET_ORDER.find((name) =>
    isMatchingFocusV2Preferences(preferences, FOCUS_V2_PRESETS[name]),
  ) ?? "custom");

  const config = useMemo(
    () => ({ taskId, ...preferences }),
    [taskId, preferences],
  );
  const parsedConfig = useMemo(() => focusV2ConfigSchema.safeParse(config), [config]);
  const parsedPreferences = useMemo(
    () => focusV2PreferencesSchema.safeParse(preferences),
    [preferences],
  );
  const schedule = useMemo(
    () => parsedConfig.success ? buildFocusV2Schedule(parsedConfig.data) : null,
    [parsedConfig],
  );

  function updateNumber(key: NumberField, value: string) {
    setForceCustom(true);
    setPreferences((previous) => ({
      ...previous,
      [key]: value.trim() === "" ? Number.NaN : Number(value),
    }));
  }

  function updateToggle(key: BooleanField, checked: boolean) {
    setForceCustom(true);
    setPreferences((previous) => ({ ...previous, [key]: checked }));
  }

  function choosePreset(name: FocusV2PresetName) {
    setForceCustom(false);
    setPreferences({ ...FOCUS_V2_PRESETS[name] });
  }

  function showValidationError() {
    toast.error(t("invalidConfig"));
  }

  async function savePreferences() {
    if (busy) return;
    if (!parsedPreferences.success) {
      showValidationError();
      return;
    }
    setSaving(true);
    try {
      const result = await saveFocusV2PreferencesAction(parsedPreferences.data);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function startSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!parsedConfig.success) {
      showValidationError();
      return;
    }
    setStarting(true);
    try {
      const result = await createFocusV2SessionAction(parsedConfig.data);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(t("created"));
      // Phase 5: session appears on /focus without navigating to the QA Lab.
      router.refresh();
    } catch {
      toast.error(t("startFailed"));
    } finally {
      setStarting(false);
    }
  }

  const segmentLabel = (kind: FocusV2SegmentKind) =>
    kind === "focus" ? t("focusSegment") :
    kind === "long_break" ? t("longBreakSegment") : t("shortBreakSegment");

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="space-y-1 border-b border-border px-5 py-4">
        <h2 className="text-section font-semibold">{t("title")}</h2>
        <p className="text-caption text-muted-foreground">{t("description")}</p>
      </div>
      <form onSubmit={(event) => void startSession(event)} className="grid min-w-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" aria-busy={busy}>
        <div className="min-w-0 space-y-4 p-5">
          <fieldset disabled={busy} className="space-y-3">
            <legend className="text-label font-medium">{t("presetsTitle")}</legend>
            <div role="group" aria-label={t("presetsTitle")} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {FOCUS_V2_PRESET_ORDER.map((name) => (
                <Button key={name} type="button" variant={activePreset === name ? "secondary" : "outline"}
                  size="sm" aria-pressed={activePreset === name}
                  onClick={() => choosePreset(name)}>{t(`presets.${name}`)}</Button>
              ))}
              <Button type="button" size="sm" variant={activePreset === "custom" ? "secondary" : "outline"}
                aria-pressed={activePreset === "custom"} onClick={() => setForceCustom(true)}>
                {t("presets.custom")}
              </Button>
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor={`${uniqueId}-task`}>{t("task")}</Label>
            <Select value={taskId || "no-task"} disabled={busy}
              onValueChange={(value) => setTaskId(value === "no-task" ? "" : value)}>
              <SelectTrigger id={`${uniqueId}-task`} className="w-full sm:h-touch lg:h-control">
                <SelectValue placeholder={t("chooseTask")} />
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)]">
                <SelectItem value="no-task">{t("noTask")}</SelectItem>
                {tasks.map((task) => (
                  <SelectItem key={task.id} value={task.id} className="whitespace-normal">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{task.title}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {numericSettings.map(({ key, min, max }) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`${uniqueId}-${key}`}>{t(`fields.${key}`)}</Label>
                <Input id={`${uniqueId}-${key}`} type="number" inputMode="numeric"
                  min={min} max={max} step={1} required
                  value={Number.isNaN(preferences[key]) ? "" : preferences[key]}
                  onChange={(event) => updateNumber(key, event.target.value)}
                  disabled={busy} aria-invalid={!Number.isInteger(preferences[key]) || preferences[key] < min || preferences[key] > max}
                  className="sm:h-touch lg:h-control" />
                <p className="text-[11px] text-muted-foreground">{t("range", { min, max })}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {(["autoStartBreaks", "autoStartFocus"] as const).map((key) => (
              <label key={key} className="flex min-w-0 cursor-pointer items-start gap-2 rounded-xl border border-border bg-muted/20 p-3">
                <input type="checkbox" checked={preferences[key]}
                  onChange={(event) => updateToggle(key, event.target.checked)}
                  disabled={busy} className="mt-1 size-4 accent-primary" />
                <span className="space-y-1">
                  <span className="block text-label font-medium">{t(`toggles.${key}`)}</span>
                  <span className="block text-caption text-muted-foreground">{t(`toggleHelp.${key}`)}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={busy || !parsedConfig.success} className="sm:min-h-touch lg:min-h-control">
              <Play aria-hidden="true" /> {starting ? t("starting") : t("start")}
            </Button>
            <Button type="button" variant="outline" disabled={busy || !parsedPreferences.success}
              onClick={() => void savePreferences()} className="sm:min-h-touch lg:min-h-control">
              <Save aria-hidden="true" /> {saving ? t("saving") : t("saveDefaults")}
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">{t("savedHint")}</p>
        </div>
        <div className="min-w-0 space-y-4 border-t border-border bg-muted/25 p-5 lg:border-t-0 lg:border-l">
          <h3 className="text-label font-semibold">{t("scheduleTitle")}</h3>
          {schedule ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Metric label={t("totalFocus")} value={schedule.plannedFocusMinutes} unit={t("minuteUnit")} />
                <Metric label={t("totalBreak")} value={schedule.plannedBreakMinutes} unit={t("minuteUnit")} />
                <Metric label={t("totalDuration")} value={schedule.plannedTotalMinutes} unit={t("minuteUnit")} />
              </div>
              <ol className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" aria-label={t("scheduleTitle")}>
                {schedule.segments.map((segment) => (
                  <li key={segment.position} className={`min-w-0 rounded-lg border px-3 py-2.5 text-caption ${segment.segmentKind === "focus" ? "border-primary/15 bg-primary/5" : "border-border bg-card"}`}>
                    <span className="font-medium">{t("round", { number: segment.roundNumber })}</span>
                    <span className="ml-2 text-muted-foreground">{segmentLabel(segment.segmentKind)} · {segment.plannedSeconds / 60} {t("minuteUnit")}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p role="alert" className="text-body text-destructive">{t("invalidConfig")}</p>
          )}
          <p className="text-caption text-muted-foreground">{t("noFinalBreak")}</p>
        </div>

      </form>
    </section>
  );
}

function Metric({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-label font-semibold tabular-nums">{value} <span className="font-normal">{unit}</span></p>
    </div>
  );
}
