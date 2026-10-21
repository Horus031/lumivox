"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FocusV2AudioEngine } from "./focus-v2-audio.engine";
import { getFocusV2TransitionCue, toFocusV2AudioPhase } from "./focus-v2-audio.cues";
import type { FocusV2Cue } from "./focus-v2-audio.cues";
import {
  DEFAULT_FOCUS_V2_AUDIO_SETTINGS, FOCUS_V2_AUDIO_STORAGE_KEY,
  parseFocusV2AudioSettings, shouldPlayFocusV2Ambient,
} from "./focus-v2-audio.settings";
import type { FocusV2AudioSettings } from "./focus-v2-audio.settings";
import type { FocusV2Projection } from "./focus-v2.types";

export function useFocusV2Audio(sessionId: string, projection: FocusV2Projection) {
  const [settings, setSettings] = useState<FocusV2AudioSettings>(DEFAULT_FOCUS_V2_AUDIO_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  // Deliberately NOT persisted: every page load requires a fresh user gesture.
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<FocusV2AudioEngine | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const mountedRef = useRef(false);
  const previousPhaseRef = useRef(toFocusV2AudioPhase(projection));
  const settingsRef = useRef(settings);
  const enabledRef = useRef(enabled);

  settingsRef.current = settings;
  enabledRef.current = enabled;

  useEffect(() => {
    mountedRef.current = true;
    try {
      const saved = window.localStorage.getItem(FOCUS_V2_AUDIO_STORAGE_KEY);
      if (saved) setSettings(parseFocusV2AudioSettings(JSON.parse(saved) as unknown));
    } catch { /* Private browsing or invalid saved content: defaults remain. */ }
    setHydrated(true);
    return () => {
      mountedRef.current = false;
      const engine = engineRef.current;
      engineRef.current = null;
      if (engine) void engine.close();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(FOCUS_V2_AUDIO_STORAGE_KEY, JSON.stringify(settings)); }
    catch { /* Storage is optional: audio still works for the active page. */ }
  }, [settings, hydrated]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`lumivox-focus-v2-audio-${sessionId}`);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent) => {
      if (event.data?.type !== "audio-claimed" || !enabledRef.current) return;
      engineRef.current?.stopAmbient();
      setEnabled(false);
      setError(null);
    };
    return () => { channelRef.current = null; channel.close(); };
  }, [sessionId]);

  const updateSettings = useCallback((patch: Partial<FocusV2AudioSettings>) => {
    setSettings((previous) => parseFocusV2AudioSettings({ ...previous, ...patch }));
  }, []);

  const toggleAudio = useCallback(async () => {
    if (enabledRef.current) {
      engineRef.current?.stopAmbient();
      setEnabled(false);
      setError(null);
      return;
    }
    const engine = engineRef.current ?? new FocusV2AudioEngine();
    engineRef.current = engine;
    try {
      // Must execute the AudioContext.resume() path directly inside the click handler.
      await engine.unlock();
      if (!mountedRef.current) return;
      engine.setAmbientVolume(settingsRef.current.volume, settingsRef.current.muted);
      engine.setCueVolume(settingsRef.current.cueVolume, settingsRef.current.cuesEnabled);
      setEnabled(true);
      setError(null);
      channelRef.current?.postMessage({ type: "audio-claimed" });
    } catch {
      if (mountedRef.current) {
        setEnabled(false);
        setError("unavailable");
      }
    }
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !enabled) return;
    engine.setAmbientVolume(settings.volume, settings.muted);
    engine.setCueVolume(settings.cueVolume, settings.cuesEnabled);
    const shouldPlay = shouldPlayFocusV2Ambient(
      enabled, projection.phase, projection.current?.segment_kind ?? null, settings,
    );
    if (shouldPlay) engine.playAmbient(settings.sound);
    else engine.stopAmbient();
  }, [enabled, settings, projection.phase, projection.current?.segment_kind]);

  const currentId = projection.current?.id ?? null;
  const currentKind = projection.current?.segment_kind ?? null;
  useEffect(() => {
    const next = { phase: projection.phase, segmentId: currentId, segmentKind: currentKind };
    const cue = getFocusV2TransitionCue(previousPhaseRef.current, next);
    previousPhaseRef.current = next;
    if (!cue || !enabledRef.current || !settingsRef.current.cuesEnabled) return;
    if (document.hidden) return;
    engineRef.current?.playCue(cue);
  }, [projection.phase, currentId, currentKind]);

  // Phase 7: play a distraction cue ONLY after the user explicitly saved a log.
  useEffect(() => {
    function onManualSave() {
      if (!enabledRef.current || !settingsRef.current.cuesEnabled || document.hidden) return;
      engineRef.current?.playCue("distraction");
    }
    window.addEventListener("lumivox:focus-v2-distraction-saved", onManualSave);
    return () => window.removeEventListener("lumivox:focus-v2-distraction-saved", onManualSave);
  }, []);

  const previewCue = useCallback((cue: FocusV2Cue = "focus_start") => {
    if (enabledRef.current && settingsRef.current.cuesEnabled) engineRef.current?.playCue(cue);
  }, []);

  return { settings, hydrated, enabled, error, updateSettings, toggleAudio, previewCue };
}
