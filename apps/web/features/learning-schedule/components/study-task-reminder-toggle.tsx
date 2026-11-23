"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import {
  getStudyNotificationTaskOverrideAction,
  saveStudyNotificationTaskOverrideAction,
} from "../notification-preferences.actions";

export function StudyTaskReminderToggle({ taskId }: { taskId: string }) {
  const t = useTranslations("studyNotifications");
  const id = useId();
  const [loaded, setLoaded] = useState<{ enabled: boolean; globalEnabled: boolean } | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const request = useRef({}),
    inFlight = useRef(false);
  useEffect(() => {
    const version = {};
    request.current = version;
    void getStudyNotificationTaskOverrideAction({ taskId })
      .then((result) => {
        if (version !== request.current) return;
        if (!result.success) {
          setError("loadFailed");
          return;
        }
        setLoaded({ enabled: result.override.enabled, globalEnabled: result.globalEnabled });
        setEnabled(result.override.enabled);
      })
      .catch(() => {
        if (version === request.current) setError("loadFailed");
      });
    return () => {
      request.current = {};
    };
  }, [taskId]);
  async function reload() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSuccess(false);
    const version = {};
    request.current = version;
    try {
      const result = await getStudyNotificationTaskOverrideAction({ taskId });
      if (version !== request.current) return;
      if (!result.success) {
        setError("loadFailed");
        return;
      }
      setLoaded({ enabled: result.override.enabled, globalEnabled: result.globalEnabled });
      setEnabled(result.override.enabled);
    } catch {
      if (version === request.current) setError("loadFailed");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (inFlight.current || !loaded || loaded.enabled === enabled) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSuccess(false);
    const version = request.current,
      snapshot = { taskId, enabled };
    try {
      const result = await saveStudyNotificationTaskOverrideAction(snapshot);
      if (version !== request.current) return;
      if (!result.success) {
        setError(result.code);
        return;
      }
      setLoaded({ ...loaded, enabled: result.override.enabled });
      setEnabled(result.override.enabled);
      setSuccess(true);
    } catch {
      if (version === request.current) setError("saveFailed");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      aria-label={t("taskTitle")}
      aria-busy={busy}
      className="min-w-0 space-y-3"
    >
      <FieldError>{error && t(`errors.${error}`)}</FieldError>
      {loaded ? (
        <div className="flex items-start gap-3">
          <Checkbox
            id={id}
            role="switch"
            aria-describedby={`${id}-description`}
            checked={enabled}
            disabled={busy}
            onCheckedChange={(checked) => {
              setEnabled(checked === true);
              setSuccess(false);
              setError(null);
            }}
            className="mt-0.5"
          />
          <div className="min-w-0">
            <FieldLabel htmlFor={id}>{t("useGlobal")}</FieldLabel>
            <FieldDescription id={`${id}-description`}>
              {t("taskExplanation")} {!loaded.globalEnabled && t("globalOff")}
            </FieldDescription>
          </div>
        </div>
      ) : (
        <p role="status" className="text-caption text-muted-foreground">
          {t(error ? "noData" : "loading")}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {success && <p role="status" className="me-auto text-caption text-muted-foreground">{t("saved")}</p>}
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void reload()}>
          {t("checkLatest")}
        </Button>
        {loaded && (
          <Button
            type="button"
            size="sm"
            disabled={busy || enabled === loaded.enabled}
            onClick={() => void save()}
          >
            {busy ? t("saving") : t("saveTask")}
          </Button>
        )}
      </div>
    </section>
  );
}
