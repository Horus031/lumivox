"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { rescheduleStudySessionAction } from "../session-reschedule.actions";

type SessionForReschedule = {
  id: string; local_date: string; local_start_time: string; local_end_time: string;
  timezone: string; updated_at: string;
};
type Props = { session: SessionForReschedule; open: boolean; onOpenChange: (open: boolean) => void;
  onSaved: () => void; onReload: () => void };
type Command = Readonly<{ sessionId: string; expectedUpdatedAt: string; localDate: string;
  startTime: string; endTime: string; eventKey: string }>;

export function SessionRescheduleDialog(props: Props) {
  return props.open ? <RescheduleForm key={`${props.session.id}-${props.session.updated_at}`} {...props} /> : null;
}

function RescheduleForm({ session, open, onOpenChange, onSaved, onReload }: Props) {
  const [localDate, setLocalDate] = useState(session.local_date);
  const [startTime, setStartTime] = useState(session.local_start_time.slice(0, 5));
  const [endTime, setEndTime] = useState(session.local_end_time.slice(0, 5));
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saving, startSaving] = useTransition();
  const command = useRef<Command | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  let valid = false;
  try {
    valid = Temporal.PlainDate.from(localDate, { overflow: "reject" }).toString() === localDate &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) && /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) && startTime < endTime;
  } catch { /* Native date fields can temporarily be empty. */ }

  function edit(update: () => void) {
    if (inFlight.current || uncertain || conflict) return;
    command.current = null; // A changed payload is a new command with a new UUID.
    setError(null);
    update();
  }

  function save(retry = false) {
    if (inFlight.current || (!retry && (!valid || conflict || uncertain)) || (retry && !command.current)) return;
    if (!command.current) command.current = Object.freeze({ sessionId: session.id,
      expectedUpdatedAt: session.updated_at, localDate, startTime, endTime, eventKey: crypto.randomUUID() });
    const submission = command.current;
    inFlight.current = true;
    setError(null);
    startSaving(async () => {
      try {
        const result = await rescheduleStudySessionAction(submission);
        if (!mounted.current) return;
        if (!result.success) {
          setConflict(Boolean(result.conflict)); setUncertain(Boolean(result.uncertain)); setError(result.message);
          return;
        }
        toast.success("Study session rescheduled.");
        onOpenChange(false);
        onSaved();
      } catch {
        if (mounted.current) { setUncertain(true); setError("The result could not be confirmed. Check the latest session or retry the exact same command."); }
      } finally { inFlight.current = false; }
    });
  }

  return <Dialog open={open} onOpenChange={next => { if (!inFlight.current) onOpenChange(next); }}>
    <DialogContent showCloseButton={!saving}
      onEscapeKeyDown={event => { if (inFlight.current) event.preventDefault(); }}
      onInteractOutside={event => { if (inFlight.current) event.preventDefault(); }}>
      <DialogTitle>Reschedule study session</DialogTitle>
      <DialogDescription>Move this session only. Other recurring sessions will not be changed. Confirm the new local date and time below.</DialogDescription>
      <p className="text-sm">Current: {session.local_date} · {session.local_start_time.slice(0, 5)}–{session.local_end_time.slice(0, 5)}</p>
      <fieldset disabled={saving || conflict || uncertain} aria-busy={saving} className="space-y-3">
        <label className="block space-y-1"><span>New date</span>
          <input type="date" value={localDate} onChange={e => edit(() => setLocalDate(e.target.value))} className="w-full rounded-md border p-2" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1"><span>Start time</span>
            <input type="time" value={startTime} onChange={e => edit(() => setStartTime(e.target.value))} className="w-full rounded-md border p-2" />
          </label>
          <label className="space-y-1"><span>End time</span>
            <input type="time" value={endTime} onChange={e => edit(() => setEndTime(e.target.value))} className="w-full rounded-md border p-2" />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">Timezone: {session.timezone}</p>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {conflict && <p className="text-sm">This session changed elsewhere. Check its latest version before making another change.</p>}
      {uncertain && <p className="text-sm">The previous command may have committed. Inputs are locked; retry sends the same event key, times and expected version. Checking the latest session discards this draft.</p>}
      {(uncertain || conflict) && <Button type="button" variant="outline" disabled={saving} onClick={onReload}>Check latest session</Button>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
        {uncertain ? <Button type="button" disabled={saving} onClick={() => save(true)}>{saving ? "Saving..." : "Retry exact command"}</Button> :
          <Button type="button" disabled={!valid || saving || conflict} onClick={() => save()}>{saving ? "Saving..." : "Confirm reschedule"}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
