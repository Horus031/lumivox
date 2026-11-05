"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getStudyNotificationTaskOverrideAction, saveStudyNotificationTaskOverrideAction } from "../notification-preferences.actions";

export function StudyTaskReminderToggle({ taskId }: { taskId: string }) {
  const t = useTranslations("studyNotifications");
  const [loaded, setLoaded] = useState<{ enabled: boolean; globalEnabled: boolean } | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const request = useRef({}), inFlight = useRef(false);
  useEffect(() => {
    const version = {}; request.current = version;
    void getStudyNotificationTaskOverrideAction({ taskId }).then(result => {
      if (version !== request.current) return;
      if (!result.success) { setError("loadFailed"); return; }
      setLoaded({ enabled: result.override.enabled, globalEnabled: result.globalEnabled }); setEnabled(result.override.enabled);
    }).catch(() => { if (version === request.current) setError("loadFailed"); });
    return () => { request.current = {}; };
  }, [taskId]);
  async function reload() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null); setSuccess(false);
    const version = {}; request.current = version;
    try {
      const result = await getStudyNotificationTaskOverrideAction({ taskId });
      if (version !== request.current) return;
      if (!result.success) { setError("loadFailed"); return; }
      setLoaded({ enabled: result.override.enabled, globalEnabled: result.globalEnabled }); setEnabled(result.override.enabled);
    } catch { if (version === request.current) setError("loadFailed"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save() {
    if (inFlight.current || !loaded || loaded.enabled === enabled) return;
    inFlight.current = true; setBusy(true); setError(null); setSuccess(false);
    const version = request.current, snapshot = { taskId, enabled };
    try {
      const result = await saveStudyNotificationTaskOverrideAction(snapshot);
      if (version !== request.current) return;
      if (!result.success) { setError(result.code); return; }
      setLoaded({ ...loaded, enabled: result.override.enabled }); setEnabled(result.override.enabled); setSuccess(true);
    } catch { if (version === request.current) setError("saveFailed"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section aria-label={t("taskTitle")} aria-busy={busy} className="min-w-0 space-y-3 rounded-lg border border-border p-3">
    <h4 className="font-medium">{t("taskTitle")}</h4>
    {error && <p role="alert" className="text-sm text-destructive">{t(`errors.${error}`)}</p>}
    {loaded ? <>
      <label className="flex items-start gap-3"><input type="checkbox" role="switch" checked={enabled} disabled={busy} onChange={e => { setEnabled(e.target.checked); setSuccess(false); setError(null); }} className="mt-1 size-4 shrink-0" /><span>{t("useGlobal")}</span></label>
      <p className="text-sm text-muted-foreground">{t("taskExplanation")}</p>
      {!loaded.globalEnabled && <p className="text-sm">{t("globalOff")}</p>}
      <Button type="button" disabled={busy || enabled === loaded.enabled} onClick={() => void save()}>{busy ? t("saving") : t("saveTask")}</Button>
    </> : <p role="status">{t(error ? "noData" : "loading")}</p>}
    <Button type="button" variant="outline" disabled={busy} onClick={() => void reload()}>{t("checkLatest")}</Button>
    {success && <p role="status">{t("saved")}</p>}
  </section>;
}
