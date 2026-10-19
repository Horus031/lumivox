"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { FocusV2Projection } from "./focus-v2.types";
import {
  DEFAULT_FOCUS_V2_ATTENTION_SETTINGS,
  FOCUS_V2_ATTENTION_STORAGE_KEY,
  parseFocusV2AttentionSettings,
  type FocusV2AttentionSettings,
} from "./focus-v2-attention.settings";
import {
  canObserveFocusV2PageAway,
  classifyFocusV2Notification,
  getFocusV2AwayCandidate,
  observeFocusV2Phase,
  type FocusV2AwayCandidate,
} from "./focus-v2-attention.model";

const isNotificationSupported = () => typeof window !== "undefined" && "Notification" in window;

export function useFocusV2Attention(sessionId: string, projection: FocusV2Projection) {
  const t = useTranslations("focus.attention");
  const [settings, setSettings] = useState<FocusV2AttentionSettings>(DEFAULT_FOCUS_V2_ATTENTION_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [awayCandidate, setAwayCandidate] = useState<FocusV2AwayCandidate | null>(null);
  const projectionRef = useRef(projection);
  const previousPhaseRef = useRef(observeFocusV2Phase(projection));
  const hiddenRef = useRef<{ at: number; segmentId: string } | null>(null);
  projectionRef.current = projection;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FOCUS_V2_ATTENTION_STORAGE_KEY);
      if (stored) setSettings(parseFocusV2AttentionSettings(JSON.parse(stored) as unknown));
    } catch { /* Settings storage is optional. */ }
    setPermission(isNotificationSupported() ? Notification.permission : "unsupported");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(FOCUS_V2_ATTENTION_STORAGE_KEY, JSON.stringify(settings)); }
    catch { /* Do not block focus sessions if browser storage is denied. */ }
  }, [hydrated, settings]);

  const updateSettings = useCallback((patch: Partial<FocusV2AttentionSettings>) => {
    setSettings((current) => parseFocusV2AttentionSettings({ ...current, ...patch }));
    if (patch.pageAwayPromptEnabled === false) {
      hiddenRef.current = null;
      setAwayCandidate(null);
    }
  }, []);

  // Must run directly inside the user-initiated click handler. Never auto-prompt.
  const enableNotifications = useCallback(async () => {
    if (!isNotificationSupported() || !window.isSecureContext) {
      setPermissionError(t("permissionUnavailable"));
      setPermission("unsupported");
      return;
    }
    try {
      const result = Notification.permission === "granted"
        ? "granted" : await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        updateSettings({ notificationsEnabled: true });
        setPermissionError(null);
      } else {
        updateSettings({ notificationsEnabled: false });
        setPermissionError(t("permissionDenied"));
      }
    } catch {
      setPermissionError(t("permissionUnavailable"));
    }
  }, [t, updateSettings]);

  useEffect(() => {
    const previous = previousPhaseRef.current;
    const next = observeFocusV2Phase(projection);
    previousPhaseRef.current = next;
    if (!hydrated || !settings.notificationsEnabled || !isNotificationSupported()) return;
    if (Notification.permission !== "granted") return;
    const kind = classifyFocusV2Notification(previous, next);
    if (!kind) return;
    try {
      // `tag` replaces an existing notification for the same session boundary.
      // Not a background alarm: shown only when the browser processes a snapshot transition.
      const notification = new Notification(t("notificationTitle"), {
        body: t(`notifications.${kind}`),
        tag: `lumivox-focus-v2-${sessionId}-${kind}-${next.segmentId ?? "final"}`,
        silent: true,
      });
      notification.onclick = () => { window.focus(); notification.close(); };
    } catch { /* Desktop/mobile browsers may refuse window-context notifications. */ }
  }, [hydrated, projection, sessionId, settings.notificationsEnabled, t]);

  useEffect(() => {
    if (!hydrated || !settings.pageAwayPromptEnabled) return;
    function onVisibilityChange() {
      const current = projectionRef.current;
      if (document.hidden) {
        hiddenRef.current = canObserveFocusV2PageAway(current) && current.current
          ? { at: Date.now(), segmentId: current.current.id } : null;
        return;
      }
      const hidden = hiddenRef.current;
      hiddenRef.current = null;
      if (!hidden) return;
      const candidate = getFocusV2AwayCandidate(
        hidden.at, Date.now(), hidden.segmentId,
        canObserveFocusV2PageAway(current) && current.current?.id === hidden.segmentId,
        settings.minimumAwaySeconds,
      );
      if (candidate) setAwayCandidate(candidate);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      hiddenRef.current = null;
    };
  }, [hydrated, sessionId, settings.pageAwayPromptEnabled, settings.minimumAwaySeconds]);

  // A suggestion must never outlive the focus round it was observed in.
  useEffect(() => {
    if (awayCandidate && (
      !canObserveFocusV2PageAway(projection) ||
      projection.current?.id !== awayCandidate.segmentId
    )) setAwayCandidate(null);
  }, [awayCandidate, projection]);

  const dismissAwayCandidate = useCallback(() => setAwayCandidate(null), []);

  return {
    settings, hydrated, permission, permissionError, awayCandidate,
    updateSettings, enableNotifications, dismissAwayCandidate,
  };
}
