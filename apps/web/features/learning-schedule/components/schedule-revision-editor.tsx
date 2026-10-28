"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
        if (!result.success) { setError(result.message); return; }
        setLoaded({ revision: result.revision, draft: result.draft });
        setConflict(false);
      } catch {
        if (!cancelled) setError("Unable to load schedule editor.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [scheduleId, reload]);

  function review(draft: StudyScheduleInput) {
    if (!loaded || conflict || inFlight.current) return;
    setError(null);
    try {
      const now = Temporal.Now.instant();
      const today = now.toZonedDateTimeISO(draft.timezone).toPlainDate();
      const occurrences = generateStudyOccurrences(draft);
      if (Temporal.PlainDate.compare(draft.startsOn, today) < 0 ||
        occurrences.some(x => Temporal.Instant.compare(x.scheduledStartAt, now) <= 0)) {
        setError("Choose a start date of today or later and session times in the future. Existing dates are kept until you change them.");
        return;
      }
      setPending(draft);
    } catch {
      setError("Check the schedule dates, timezone and weekly slots.");
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
          setError(result.message);
          return;
        }
        toast.success(`Study schedule updated to revision ${result.revision}.`);
        onSaved();
        router.refresh();
      } catch {
        if (mounted.current) { setPending(null); setError("Unable to revise schedule."); }
      } finally {
        inFlight.current = false;
      }
    });
  }

  if (loading) return <p role="status">Loading schedule editor...</p>;
  if (!loaded) return <div role="alert" className="space-y-2">
    <p>{error ?? "Schedule unavailable."}</p>
    <Button type="button" onClick={() => setReload(x => x + 1)}>Retry</Button>
    <Button type="button" variant="outline" onClick={onCancel}>Close</Button>
  </div>;

  return <section aria-label="Recurring schedule revision" className="space-y-4">
    <h4 className="font-medium">Edit recurring study schedule</h4>
    <p>Current revision: {loaded.revision} · Prospective revision: {loaded.revision + 1}</p>
    <p className="text-sm text-muted-foreground">
      Saving cancels future scheduled sessions and generates replacements, including individually rescheduled sessions.
      Completed and historical sessions remain. Choose today or a later start date, with all new sessions in the future.
    </p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {conflict && <div className="space-y-2">
      <p>Another update changed this schedule. Your draft is kept below. Reloading discards it and loads the latest saved schedule.</p>
      <Button type="button" onClick={() => { setLoaded(null); setReload(x => x + 1); }}>Discard draft and reload</Button>
    </div>}
    <fieldset disabled={saving || conflict || pending !== null} aria-busy={saving} className="space-y-3">
      <ScheduleDraftEditor key={`${scheduleId}-${loaded.revision}`} initialValue={loaded.draft} onContinue={review} />
    </fieldset>
    <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Cancel</Button>
    <Dialog open={pending !== null} onOpenChange={open => { if (!open && !inFlight.current) setPending(null); }}>
      <DialogContent showCloseButton={!saving} onEscapeKeyDown={event => { if (inFlight.current) event.preventDefault(); }}
        onInteractOutside={event => { if (inFlight.current) event.preventDefault(); }}>
        <DialogTitle>Confirm recurring schedule revision</DialogTitle>
        <DialogDescription>
          Future scheduled sessions will be cancelled and replaced, including individual session overrides.
          Completed and past sessions stay in history. Save revision {loaded.revision + 1}?
        </DialogDescription>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => setPending(null)}>Back to draft</Button>
          <Button type="button" disabled={saving} onClick={save}>Confirm revision</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
