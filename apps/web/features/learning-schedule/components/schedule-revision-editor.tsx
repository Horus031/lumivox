"use client";

import { useTranslations } from "next-intl";

import { useEffect, useRef, useState, useTransition } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useScheduleDialogFocus } from "../use-schedule-dialog-focus";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { reviseStudyScheduleAction } from "../schedule-revision.actions";
import { getStudyScheduleEditorAction } from "../schedule-editor.queries.actions";
import { generateStudyOccurrences, type StudyScheduleInput } from "../schedule-engine";
import { ScheduleDraftEditor } from "./schedule-draft-editor";

type Props = { scheduleId: string; onSaved: () => void; onCancel: () => void };
type LoadedDraft = { revision: number; draft: StudyScheduleInput };

export function ScheduleRevisionEditor(props: Props) {
  return <RevisionEditor key={props.scheduleId} {...props} />;
}

function RevisionEditor({ scheduleId, onSaved, onCancel }: Props) {
  const t = useTranslations("learningSchedule");
  const dialogFocus = useScheduleDialogFocus();
  const router = useRouter();
  const [loaded, setLoaded] = useState<LoadedDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<StudyScheduleInput | null>(null);
  const [saving, startSaving] = useTransition();
  const inFlight = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await getStudyScheduleEditorAction(scheduleId);
        if (cancelled) return;
        if (!result.success) { setError(t(`errors.${result.code ?? "loadFailed"}`)); return; }
        setLoaded({ revision: result.revision, draft: result.draft });
        setConflict(false);
      } catch {
        if (!cancelled) setError(t("errors.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [scheduleId, reload, t]);

  function review(draft: StudyScheduleInput) {
    if (!loaded || conflict || inFlight.current) return;
    setError(null);
    try {
      const now = Temporal.Now.instant();
      const today = now.toZonedDateTimeISO(draft.timezone).toPlainDate();
      const occurrences = generateStudyOccurrences(draft);
      if (Temporal.PlainDate.compare(draft.startsOn, today) < 0 ||
        occurrences.some(x => Temporal.Instant.compare(x.scheduledStartAt, now) <= 0)) {
        setError(t("errors.futureDates"));
        return;
      }
      dialogFocus.captureOpener();
      setPending(draft);
    } catch {
      setError(t("errors.invalidInput"));
    }
  }

  function save() {
    if (!loaded || !pending || conflict || inFlight.current) return;
    inFlight.current = true;
    const draft = pending;
    setError(null);
    startSaving(async () => {
      try {
        const result = await reviseStudyScheduleAction({ scheduleId, expectedRevision: loaded.revision, ...draft });
        if (!mounted.current) return;
        setPending(null);
        if (!result.success) {
          setConflict(Boolean(result.conflict));
          setError(t(`errors.${result.code ?? "saveFailed"}`));
          return;
        }
        toast.success(t("revised", { revision: result.revision }));
        onSaved();
        router.refresh();
      } catch {
        if (mounted.current) { setPending(null); setError(t("errors.saveFailed")); }
      } finally {
        inFlight.current = false;
      }
    });
  }

  if (loading) return <p role="status">{t("loadingEditor")}</p>;
  if (!loaded) return <div role="alert" className="space-y-2">
    <p>{error ?? t("errors.loadFailed")}</p>
    <Button type="button" onClick={() => setReload(x => x + 1)}>{t("retry")}</Button>
    <Button type="button" variant="outline" onClick={onCancel}>{t("close")}</Button>
  </div>;

  return <section aria-label={t("revisionEditor")} className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
    <h4 className="font-medium">{t("revisionTitle")}</h4>
    <p>{t("versions", { current: loaded.revision, next: loaded.revision + 1 })}</p>
    <p className="text-sm text-muted-foreground">{t("revisionImpact")}</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {conflict && <div className="space-y-2">
      <p>{t("conflictDraft")}</p>
      <Button type="button" onClick={() => { setLoaded(null); setReload(x => x + 1); }}>{t("discardReload")}</Button>
    </div>}
    <fieldset disabled={saving || conflict || pending !== null} aria-busy={saving} className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
      <ScheduleDraftEditor key={`${scheduleId}-${loaded.revision}`} initialValue={loaded.draft} onContinue={review} />
    </fieldset>
    <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>{t("cancel")}</Button>
    <Dialog open={pending !== null} onOpenChange={open => { if (!open && !inFlight.current) setPending(null); }}>
      <DialogContent {...dialogFocus.dialogProps} className="max-h-[calc(100dvh-2rem)] overflow-y-auto [overflow-wrap:anywhere]" showCloseButton={false} onEscapeKeyDown={event => { if (inFlight.current) event.preventDefault(); }}
        onInteractOutside={event => { if (inFlight.current) event.preventDefault(); }}>
        <DialogTitle>{t("confirmRevisionTitle")}</DialogTitle>
        <DialogDescription>
          {t("confirmRevisionImpact", { revision: loaded.revision + 1 })}
        </DialogDescription>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => setPending(null)}>{t("backToDraft")}</Button>
          <Button type="button" disabled={saving} onClick={save}>{t("confirmRevision")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
