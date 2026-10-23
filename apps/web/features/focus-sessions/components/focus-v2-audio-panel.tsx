"use client";

import { Headphones, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useFocusV2Audio } from "../use-focus-v2-audio";
import { FOCUS_V2_AUDIO_SOUNDS } from "../focus-v2-audio.settings";
import type { FocusV2AudioSound } from "../focus-v2-audio.settings";
import type { FocusV2Projection } from "../focus-v2.types";

type Props = { sessionId: string; projection: FocusV2Projection };

export function FocusV2AudioPanel({ sessionId, projection }: Props) {
  const audio = useFocusV2Audio(sessionId, projection);
  return <FocusV2AudioControls audio={audio} />;
}

export function FocusV2AudioControls({ audio }: { audio: ReturnType<typeof useFocusV2Audio>; }) {
  const t = useTranslations("focus.audio");
  const { settings, hydrated, enabled, error, updateSettings, toggleAudio, previewCue } =
    audio;

  return (
    <section aria-label={t("title")} className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Headphones aria-hidden="true" className="size-5 shrink-0" />
          <div>
            <h3 className="text-label font-semibold">{t("title")}</h3>
            <p className="text-caption text-muted-foreground">{t("description")}</p>
          </div>
        </div>
        <Button type="button" variant={enabled ? "secondary" : "outline"}
          aria-pressed={enabled} disabled={!hydrated}
          onClick={() => void toggleAudio()}>
          {enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          {enabled ? t("disable") : t("enable")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="focus-v2-sound" className="text-label font-medium">{t("sound")}</label>
          <select id="focus-v2-sound" value={settings.sound} disabled={!hydrated}
            onChange={(event) => updateSettings({ sound: event.target.value as FocusV2AudioSound })}
            className="h-touch w-full rounded-md border border-border bg-background px-3 text-body sm:h-control">
            {FOCUS_V2_AUDIO_SOUNDS.map((kind) => (
              <option key={kind} value={kind}>{t(`sounds.${kind}`)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="focus-v2-audio-volume" className="text-label font-medium">
            {t("volume", { value: settings.volume })}
          </label>
          <input id="focus-v2-audio-volume" type="range" min={0} max={100} step={1}
            value={settings.volume} disabled={!hydrated} aria-valuetext={`${settings.volume}%`}
            onChange={(event) => updateSettings({ volume: Number(event.target.value) })}
            className="h-touch w-full accent-primary sm:h-control" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" checked={settings.muted} disabled={!hydrated}
            onChange={(event) => updateSettings({ muted: event.target.checked })}
            className="size-4 accent-primary" />
          {t("mute")}
        </label>
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" checked={settings.playDuringBreak} disabled={!hydrated}
            onChange={(event) => updateSettings({ playDuringBreak: event.target.checked })}
            className="size-4 accent-primary" />
          {t("duringBreak")}
        </label>
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" checked={settings.cuesEnabled} disabled={!hydrated}
            onChange={(event) => updateSettings({ cuesEnabled: event.target.checked })}
            className="size-4 accent-primary" />
          {t("cues")}
        </label>
        <div className="space-y-2">
          <label htmlFor="focus-v2-cues-volume" className="text-label font-medium">
            {t("cuesVolume", { value: settings.cueVolume })}
          </label>
          <input id="focus-v2-cues-volume" type="range" min={0} max={100} step={1}
            value={settings.cueVolume} disabled={!hydrated || !settings.cuesEnabled}
            aria-valuetext={`${settings.cueVolume}%`}
            onChange={(event) => updateSettings({ cueVolume: Number(event.target.value) })}
            className="h-touch w-full accent-primary sm:h-control" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!enabled || !settings.cuesEnabled}
          onClick={() => previewCue("focus_start")}>{t("previewCue")}</Button>
        <p role="status" className="text-caption text-muted-foreground">
          {enabled ? t("ready") : t("optIn")}
        </p>
      </div>
      {error && <p role="alert" className="text-body text-destructive">{t("unavailable")}</p>}
      <p className="text-caption text-muted-foreground">{t("privacy")}</p>
    </section>
  );
}
