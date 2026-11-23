"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatStudyDate } from "../schedule-presentation";

import { useEffect, useRef, useState, useTransition } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { toast } from "sonner";
import { useScheduleDialogFocus } from "../use-schedule-dialog-focus";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { FieldError } from "@/components/ui/field";
import { TimePicker } from "@/components/ui/time-picker";
import { formatLocalDate, parseLocalDate } from "@/lib/local-date";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rescheduleStudySessionAction } from "../session-reschedule.actions";

type SessionForReschedule = {
  id: string;
  local_date: string;
  local_start_time: string;
  local_end_time: string;
  timezone: string;
  updated_at: string;
};
type Props = {
  session: SessionForReschedule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onReload: () => void;
};
type Command = Readonly<{
  sessionId: string;
  expectedUpdatedAt: string;
  localDate: string;
  startTime: string;
  endTime: string;
  eventKey: string;
}>;

export function SessionRescheduleDialog(props: Props) {
  return props.open ? (
    <RescheduleForm key={`${props.session.id}-${props.session.updated_at}`} {...props} />
  ) : null;
}

function RescheduleForm({ session, open, onOpenChange, onSaved, onReload }: Props) {
  const t = useTranslations("learningSchedule");
  const locale = useLocale();
  const dialogFocus = useScheduleDialogFocus();
  const [localDate, setLocalDate] = useState(session.local_date);
  const [startTime, setStartTime] = useState(session.local_start_time.slice(0, 5));
  const [endTime, setEndTime] = useState(session.local_end_time.slice(0, 5));
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saving, startSaving] = useTransition();
  const command = useRef<Command | null>(null);
  const fieldsDisabled = saving || conflict || uncertain;
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  let valid = false;
  try {
    valid =
      Temporal.PlainDate.from(localDate, { overflow: "reject" }).toString() === localDate &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) &&
      startTime < endTime;
  } catch {
    /* A missing or invalid date cannot be submitted. */
  }

  function edit(update: () => void) {
    if (inFlight.current || uncertain || conflict) return;
    command.current = null; // A changed payload is a new command with a new UUID.
    setError(null);
    update();
  }

  function save(retry = false) {
    if (
      inFlight.current ||
      (!retry && (!valid || conflict || uncertain)) ||
      (retry && !command.current)
    )
      return;
    if (!command.current)
      command.current = Object.freeze({
        sessionId: session.id,
        expectedUpdatedAt: session.updated_at,
        localDate,
        startTime,
        endTime,
        eventKey: crypto.randomUUID(),
      });
    const submission = command.current;
    inFlight.current = true;
    setError(null);
    startSaving(async () => {
      try {
        const result = await rescheduleStudySessionAction(submission);
        if (!mounted.current) return;
        if (!result.success) {
          setConflict(Boolean(result.conflict));
          setUncertain(Boolean(result.uncertain));
          setError(t(`errors.${result.code ?? "saveFailed"}`));
          return;
        }
        toast.success(t("rescheduled"));
        onOpenChange(false);
        onSaved();
      } catch {
        if (mounted.current) {
          setUncertain(true);
          setError(t("errors.uncertain"));
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!inFlight.current) onOpenChange(next);
      }}
    >
      <DialogContent
        {...dialogFocus.dialogProps}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto [overflow-wrap:anywhere]"
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (inFlight.current) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (inFlight.current) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("rescheduleTitle")}</DialogTitle>
          <DialogDescription>{t("rescheduleDescription")}</DialogDescription>
        </DialogHeader>
        <Card className="space-y-1 bg-muted/30 p-3 text-body">
          <p className="font-medium">
            {t("current")}: {formatStudyDate(session.local_date, locale)} ·{" "}
            {session.local_start_time.slice(0, 5)}–{session.local_end_time.slice(0, 5)}
          </p>
          <p className="text-caption text-muted-foreground wrap-anywhere">
            {t("timezone")}: {session.timezone}
          </p>
        </Card>
        <fieldset
          disabled={fieldsDisabled}
          aria-busy={saving}
          className="min-w-0 space-y-3 [overflow-wrap:anywhere]"
        >
          <DatePicker
            label={t("newDate")}
            value={parseLocalDate(localDate)}
            onChange={(date) => edit(() => setLocalDate(formatLocalDate(date)))}
            disabled={fieldsDisabled}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <TimePicker
              label={t("startTime")}
              pickerLabel={t("pickStartTime")}
              value={startTime}
              onChange={(time) => edit(() => setStartTime(time))}
              disabled={fieldsDisabled}
            />
            <TimePicker
              label={t("endTime")}
              pickerLabel={t("pickEndTime")}
              value={endTime}
              onChange={(time) => edit(() => setEndTime(time))}
              disabled={fieldsDisabled}
            />
          </div>
        </fieldset>
        <FieldError>{error}</FieldError>
        {conflict && <p className="text-sm">{t("sessionConflict")}</p>}
        {uncertain && <p className="text-sm">{t("unknownHelp")}</p>}
        {(uncertain || conflict) && (
          <Button type="button" variant="outline" disabled={saving} onClick={onReload}>
            {t("checkLatest")}
          </Button>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          {uncertain ? (
            <Button type="button" disabled={saving} onClick={() => save(true)}>
              {saving ? t("saving") : t("retryExact")}
            </Button>
          ) : (
            <Button type="button" disabled={!valid || saving || conflict} onClick={() => save()}>
              {saving ? t("saving") : t("confirmReschedule")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
