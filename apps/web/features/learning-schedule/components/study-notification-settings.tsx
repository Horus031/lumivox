"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getStudyNotificationPreferencesAction,
  saveStudyNotificationPreferencesAction,
  saveStudyReminderLocaleAction,
} from "../notification-preferences.actions";
import {
  studyNotificationPreferencesSchema,
  type StudyNotificationPreferences,
  type StudyNotificationPreferencesInput,
} from "../notification-preferences.schemas";

type Props = {
  initialPreferences?: StudyNotificationPreferences;
  initialError?: string;
  allowOptIn?: boolean;
};
function command(p: StudyNotificationPreferences): StudyNotificationPreferencesInput {
  return {
    studyEmailEnabled: p.studyEmailEnabled,
    leadMinutes: p.leadMinutes,
    quietHoursEnabled: p.quietHoursEnabled,
    quietStartLocal: p.quietStartLocal,
    quietEndLocal: p.quietEndLocal,
    timezone: p.timezone,
  };
}

export function StudyNotificationSettings({
  initialPreferences,
  initialError,
  allowOptIn = false,
}: Props) {
  const t = useTranslations("studyNotifications");
  const id = useId();
  const [saved, setSaved] = useState(initialPreferences ?? null);
  const [draft, setDraft] = useState(() =>
    initialPreferences ? command(initialPreferences) : null,
  );
  const [error, setError] = useState(initialError ? "loadFailed" : null);
  const [busy, setBusy] = useState<"saving" | "loading" | "locale" | null>(null);
  const [localeDraft, setLocaleDraft] = useState(initialPreferences?.reminderLocale ?? "");
  const [success, setSuccess] = useState(false);
  const inFlight = useRef(false);
  const dirty = saved && draft && JSON.stringify(command(saved)) !== JSON.stringify(draft);
  function change(patch: Partial<StudyNotificationPreferencesInput>) {
    setDraft((value) => (value ? { ...value, ...patch } : value));
    setSuccess(false);
    setError(null);
  }
  async function reload() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("loading");
    setError(null);
    setSuccess(false);
    try {
      const result = await getStudyNotificationPreferencesAction();
      if (!result.success) {
        setError("loadFailed");
        return;
      }
      setSaved(result.preferences);
      setDraft(command(result.preferences));
      setLocaleDraft(result.preferences.reminderLocale ?? "");
    } catch {
      setError("loadFailed");
    } finally {
      setBusy(null);
      inFlight.current = false;
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !draft || !saved || !dirty) return;
    // An opt-out must not depend on an unrelated invalid unsaved quiet-hours
    // draft. Preserve the last valid stored policy and change consent only.
    const snapshot =
      !draft.studyEmailEnabled && saved.studyEmailEnabled
        ? { ...command(saved), studyEmailEnabled: false }
        : { ...draft };
    if (!studyNotificationPreferencesSchema.safeParse(snapshot).success) {
      setError("invalidInput");
      setSuccess(false);
      return;
    }
    inFlight.current = true;
    setBusy("saving");
    setError(null);
    setSuccess(false);
    void (async () => {
      try {
        const result = await saveStudyNotificationPreferencesAction(snapshot);
        if (!result.success) {
          setError(result.code);
          return;
        }
        setSaved(result.preferences);
        setDraft(command(result.preferences));
        setSuccess(true);
        toast.success(t("saved"));
      } catch {
        setError("saveFailed");
      } finally {
        inFlight.current = false;
        setBusy(null);
      }
    })();
  }
  async function saveLocale(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || (localeDraft !== "en" && localeDraft !== "vi")) return;
    inFlight.current = true;
    setBusy("locale");
    setError(null);
    setSuccess(false);
    try {
      const result = await saveStudyReminderLocaleAction({ locale: localeDraft });
      if (!result.success) {
        setError(result.code);
        return;
      }
      setSaved(result.preferences);
      setSuccess(true);
      toast.success(t("saved"));
    } catch {
      setError("saveFailed");
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }
  return (
    <section
      aria-labelledby={`${id}-title`}
      aria-busy={busy !== null}
      data-testid="study-notification-settings"
      className="min-w-0 space-y-4 border-t border-border pt-card [overflow-wrap:anywhere]"
    >
      <h2 id={`${id}-title`} className="text-section font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <p className="rounded-lg border border-border p-3 text-sm">{t("deliveryPaused")}</p>
      {!allowOptIn && <p className="text-sm">{t("optInUnavailable")}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}
      {draft && saved ? (
        <form
          onSubmit={submit}
          noValidate
          aria-busy={busy !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-w-0 space-y-4"
        >
          <fieldset disabled={busy !== null} className="min-w-0 space-y-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                role="switch"
                name="studyEmailEnabled"
                checked={draft.studyEmailEnabled}
                disabled={!allowOptIn && !draft.studyEmailEnabled}
                onChange={(e) => change({ studyEmailEnabled: e.target.checked })}
                className="mt-1 size-4 shrink-0"
              />
              <span>
                <span className="block font-medium">{t("emailReminders")}</span>
                <span className="text-sm text-muted-foreground">{t("consent")}</span>
              </span>
            </label>
            <fieldset disabled={!draft.studyEmailEnabled} className="min-w-0 space-y-4">
              <fieldset className="min-w-0 space-y-2">
                <legend className="mb-2 font-medium">{t("leadLegend")}</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  {[5, 15, 30, 60].map((lead) => (
                    <label key={lead} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`${id}-lead`}
                        value={lead}
                        checked={draft.leadMinutes === lead}
                        onChange={() => change({ leadMinutes: lead })}
                      />
                      {t(`lead.${lead}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  role="switch"
                  name="quietHoursEnabled"
                  checked={draft.quietHoursEnabled}
                  onChange={(e) =>
                    change({
                      quietHoursEnabled: e.target.checked,
                      quietStartLocal: draft.quietStartLocal ?? "22:00",
                      quietEndLocal: draft.quietEndLocal ?? "07:00",
                      timezone: draft.timezone ?? "UTC",
                    })
                  }
                  className="size-4"
                />
                {t("quietHours")}
              </label>
              <p className="text-sm text-muted-foreground">{t("quietExplanation")}</p>
              <fieldset
                disabled={!draft.quietHoursEnabled}
                className="grid min-w-0 gap-4 sm:grid-cols-2"
              >
                <label className="min-w-0 space-y-1">
                  <span className="block">{t("quietStart")}</span>
                  <input
                    type="time"
                    value={draft.quietStartLocal ?? "22:00"}
                    onChange={(e) => change({ quietStartLocal: e.target.value })}
                    className="w-full min-w-0 rounded-md border border-input bg-background p-2"
                  />
                </label>
                <label className="min-w-0 space-y-1">
                  <span className="block">{t("quietEnd")}</span>
                  <input
                    type="time"
                    value={draft.quietEndLocal ?? "07:00"}
                    onChange={(e) => change({ quietEndLocal: e.target.value })}
                    className="w-full min-w-0 rounded-md border border-input bg-background p-2"
                  />
                </label>
                <label className="min-w-0 space-y-1 sm:col-span-2">
                  <span className="block">{t("timezone")}</span>
                  <input
                    type="text"
                    value={draft.timezone ?? "UTC"}
                    list={`${id}-zones`}
                    onChange={(e) => change({ timezone: e.target.value })}
                    aria-describedby={`${id}-zone-hint`}
                    className="w-full min-w-0 rounded-md border border-input bg-background p-2"
                  />
                </label>
                <datalist id={`${id}-zones`}>
                  {[
                    "UTC",
                    "Asia/Bangkok",
                    "Asia/Ho_Chi_Minh",
                    "America/New_York",
                    "Europe/London",
                    "Australia/Sydney",
                  ].map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
                <p id={`${id}-zone-hint`} className="text-sm text-muted-foreground sm:col-span-2">
                  {t("timezoneHint")}
                </p>
              </fieldset>
            </fieldset>
            <Button type="submit" disabled={!dirty || busy !== null}>
              {busy === "saving" ? t("saving") : t("save")}
            </Button>
          </fieldset>
        </form>
      ) : (
        <p role="status" className="text-sm">
          {busy ? t("loading") : t("noData")}
        </p>
      )}
      {saved && (
        <form onSubmit={(event) => void saveLocale(event)} className="space-y-3">
          <label className="block space-y-1">
            <span className="font-medium">{t("localeLabel")}</span>
            <select
              name="reminderLocale"
              value={localeDraft}
              disabled={busy !== null}
              onChange={(event) => {
                setLocaleDraft(event.target.value);
                setSuccess(false);
              }}
              className="w-full rounded-md border border-input bg-background p-2"
            >
              <option value="">{t("localePrompt")}</option>
              <option value="en">English</option>
              <option value="vi">Tiếng Việt</option>
            </select>
          </label>
          <p className="text-sm text-muted-foreground">{t("localeHint")}</p>
          <Button type="submit" variant="outline" disabled={busy !== null || !localeDraft}>
            {t("saveLocale")}
          </Button>
        </form>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={busy !== null}
        onClick={() => void reload()}
      >
        {busy === "loading" ? t("loading") : t("checkLatest")}
      </Button>
      <p className="text-sm text-muted-foreground">{t("checkLatestHint")}</p>
      <p role="status" aria-live="polite" className="text-sm">
        {success ? t("saved") : busy === "saving" ? t("saving") : ""}
      </p>
    </section>
  );
}
