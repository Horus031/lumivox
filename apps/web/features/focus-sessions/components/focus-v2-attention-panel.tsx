"use client";

import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bell, BellOff, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FocusV2Projection } from "../focus-v2.types";
import { logFocusV2DistractionAction } from "../focus-v2-distractions.actions";
import { useFocusV2Attention } from "../use-focus-v2-attention";

const DISTRACTION_TYPES = ["social_media", "messaging", "external_interrupt", "fatigue", "other"] as const;
type DistractionType = typeof DISTRACTION_TYPES[number];

type Props = { sessionId: string; projection: FocusV2Projection };

export function FocusV2AttentionPanel({ sessionId, projection }: Props) {
  const attention = useFocusV2Attention(sessionId, projection);
  return <FocusV2AttentionControls attention={attention} projection={projection} sessionId={sessionId} />;
}

export function FocusV2AttentionControls({ attention, projection, sessionId }: { sessionId: string; attention: ReturnType<typeof useFocusV2Attention>; projection: FocusV2Projection; }) {
  const t = useTranslations("focus.attention");
  const { settings, hydrated, permission, permissionError, awayCandidate,
    updateSettings, enableNotifications, dismissAwayCandidate,
  } = attention;
  const [distractionType, setDistractionType] = useState<DistractionType>("other");
  const [durationSeconds, setDurationSeconds] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const canLog = (projection.phase === "running" || projection.phase === "paused") &&
    projection.current?.segment_kind === "focus";

  async function saveDistraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !canLog) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await logFocusV2DistractionAction({
        sessionId, distractionType,
        durationSeconds: Number(durationSeconds),
        note,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(t("saved"));
      setDurationSeconds("0");
      setNote("");
      dismissAwayCandidate();
      // Only an explicitly saved distraction may trigger the opt-in Phase 6 cue.
      window.dispatchEvent(new Event("lumivox:focus-v2-distraction-saved"));
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4" aria-label={t("title")}>
      <div className="flex items-start gap-2">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <h3 className="text-label font-semibold">{t("title")}</h3>
          <p className="text-caption text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
        <div className="min-w-0">
          <p className="text-body font-medium">{t("notificationsTitle")}</p>
          <p className="text-caption text-muted-foreground">{t("notificationsHelp")}</p>
        </div>
        {settings.notificationsEnabled && permission === "granted" ? (
          <Button type="button" variant="outline" disabled={!hydrated}
            onClick={() => updateSettings({ notificationsEnabled: false })}>
            <BellOff aria-hidden="true" /> {t("disableNotifications")}
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={!hydrated || permission === "denied"}
            onClick={() => void enableNotifications()}>
            <Bell aria-hidden="true" /> {t("enableNotifications")}
          </Button>
        )}
      </div>
      {permissionError && <p role="alert" className="text-body text-destructive">{permissionError}</p>}
      {permission === "denied" && <p className="text-caption text-muted-foreground">{t("browserBlocked")}</p>}

      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
        <input type="checkbox" checked={settings.pageAwayPromptEnabled} disabled={!hydrated}
          onChange={(event) => updateSettings({ pageAwayPromptEnabled: event.target.checked })}
          className="mt-1 size-4 accent-primary" />
        <span>
          <span className="flex items-center gap-2 text-body font-medium"><EyeOff aria-hidden="true" className="size-4" />{t("awayTitle")}</span>
          <span className="block text-caption text-muted-foreground">{t("awayHelp")}</span>
        </span>
      </label>
      {settings.pageAwayPromptEnabled && (
        <label className="block space-y-1 text-caption">
          <span className="font-medium">{t("minimumAway")}</span>
          <select className="block h-control w-full rounded-md border border-border bg-background px-3 text-body"
            value={settings.minimumAwaySeconds}
            onChange={(event) => updateSettings({ minimumAwaySeconds: Number(event.target.value) })}
            disabled={!hydrated}>
            {[15, 30, 60, 120, 300].map((seconds) => (
              <option key={seconds} value={seconds}>{t("seconds", { count: seconds })}</option>
            ))}
          </select>
        </label>
      )}

      {awayCandidate && canLog && (
        <div role="status" className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-body">{t("awayCandidate", { seconds: awayCandidate.durationSeconds })}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => {
              setDurationSeconds(String(awayCandidate.durationSeconds));
              dismissAwayCandidate();
            }}>{t("useAwayDuration")}</Button>
            <Button type="button" size="sm" variant="outline" onClick={dismissAwayCandidate}>{t("dismiss")}</Button>
          </div>
        </div>
      )}

      <form onSubmit={(event) => void saveDistraction(event)} className="space-y-3" aria-busy={busy}>
        <h4 className="text-label font-semibold">{t("manualTitle")}</h4>
        <p className="text-caption text-muted-foreground">{t("manualHelp")}</p>
        <fieldset disabled={busy || !canLog} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-label">
            <span>{t("category")}</span>
            <select className="h-control w-full rounded-md border border-border bg-background px-3 text-body"
              value={distractionType} onChange={(event) => setDistractionType(event.target.value as DistractionType)}>
              {DISTRACTION_TYPES.map((type) => <option key={type} value={type}>{t(`categories.${type}`)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-label">
            <span>{t("duration")}</span>
            <input type="number" min={0} max={7200} step={1} required
              value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)}
              className="h-control w-full rounded-md border border-border bg-background px-3 text-body" />
          </label>
          <label className="space-y-1 text-label sm:col-span-2">
            <span>{t("note")}</span>
            <textarea value={note} maxLength={500} rows={2} onChange={(event) => setNote(event.target.value)}
              className="w-full rounded-md border border-border bg-background p-3 text-body" />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || !canLog || !Number.isInteger(Number(durationSeconds)) ||
              durationSeconds.trim() === "" || Number(durationSeconds) < 0 || Number(durationSeconds) > 7200}>
              {busy ? t("saving") : t("save")}
            </Button>
          </div>
        </fieldset>
        {!canLog && <p className="text-caption text-muted-foreground">{t("focusOnly")}</p>}
      </form>
      <p className="text-caption text-muted-foreground">{t("privacy")}</p>
    </section>
  );
}
