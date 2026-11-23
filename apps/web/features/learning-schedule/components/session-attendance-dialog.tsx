"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

import { formatStudyDate } from "../schedule-presentation";
import { useScheduleDialogFocus } from "../use-schedule-dialog-focus";
import {
  mutateStudySessionAttendanceAction,
  type AttendanceCommand,
} from "../session-attendance.actions";

type AttendanceKind = AttendanceCommand["command"];

export type AttendanceSession = {
  id: string;
  updated_at: string;
  local_date: string;
  local_start_time: string;
  local_end_time: string;
  timezone: string;
  status: string;
};

type Props = {
  session: AttendanceSession;
  kind: AttendanceKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onReload: () => void;
};

export function SessionAttendanceDialog(props: Props) {
  if (!props.open) return null;

  return (
    <AttendanceForm
      key={[props.session.id, props.session.updated_at, props.kind].join(":")}
      {...props}
    />
  );
}

function AttendanceForm({ session, kind, open, onOpenChange, onSaved, onReload }: Props) {
  const t = useTranslations("learningSchedule");
  const locale = useLocale();
  const dialogFocus = useScheduleDialogFocus();
  const reasonId = useId();

  const [reason, setReason] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);

  const [saving, startSaving] = useTransition();

  // This ref owns the exact dispatched command.
  // It must survive a timeout, so an exact retry can
  // reuse the original version and idempotency key.
  const commandRef = useRef<AttendanceCommand | null>(null);

  // A ref blocks rapid duplicate clicks synchronously,
  // before React commits pending UI state.
  const inFlight = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  function createCommand(): AttendanceCommand {
    const base = {
      sessionId: session.id,
      expectedUpdatedAt: session.updated_at,
      eventKey: crypto.randomUUID(),
    };

    if (kind === "skip") {
      return Object.freeze({
        command: "skip",
        ...base,
        reason: reason.trim() || null,
      });
    }

    return Object.freeze({
      command: kind,
      ...base,
    });
  }

  function submit(exactRetry = false) {
    if (
      inFlight.current ||
      (!exactRetry && (uncertain || conflict)) ||
      (exactRetry && (!uncertain || !commandRef.current))
    ) {
      return;
    }

    if (!commandRef.current) {
      commandRef.current = createCommand();
    }

    const submission = commandRef.current;
    inFlight.current = true;

    setErrorCode(null);

    startSaving(async () => {
      try {
        const result = await mutateStudySessionAttendanceAction(submission);

        if (!mounted.current) return;

        if (!result.success) {
          if (result.uncertain) {
            setUncertain(true);
            setConflict(false);
          } else if (result.conflict) {
            setConflict(true);
            setUncertain(false);
          } else {
            setUncertain(false);
            setConflict(false);
          }

          setErrorCode(result.code);
          return;
        }

        toast.success(t(`attendance.success.${kind}`));
        onOpenChange(false);
        onSaved();
      } catch {
        if (mounted.current) {
          setUncertain(true);
          setErrorCode("uncertain");
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  function checkLatest() {
    if (inFlight.current) return;

    onOpenChange(false);
    onReload();
  }

  function close() {
    if (inFlight.current) return;

    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!inFlight.current) {
          onOpenChange(next);
        }
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
          <DialogTitle>{t(`attendance.title.${kind}`)}</DialogTitle>
          <DialogDescription>{t(`attendance.description.${kind}`)}</DialogDescription>
        </DialogHeader>

        <Card className="space-y-1 bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <time dateTime={session.local_date} className="text-label font-semibold">{formatStudyDate(session.local_date, locale)}</time>
            <Badge variant="outline">{t(`status.${session.status}`)}</Badge>
          </div>
          <p className="text-caption text-muted-foreground wrap-anywhere">
            {session.local_start_time.slice(0, 5)} – {session.local_end_time.slice(0, 5)} · {session.timezone}
          </p>
        </Card>

        {kind === "skip" && (
          <fieldset disabled={saving || uncertain || conflict} aria-busy={saving}>
            <Field>
              <FieldLabel htmlFor={reasonId}>{t("attendance.skipReason")}</FieldLabel>
              <Textarea
                id={reasonId}
                value={reason}
                maxLength={500}
                rows={3}
                onChange={(event) => {
                  if (inFlight.current || uncertain || conflict) return;

                  commandRef.current = null;
                  setErrorCode(null);
                  setReason(event.target.value);
                }}
                className="resize-y"
              />
            </Field>
          </fieldset>
        )}

        {errorCode && (
          <FieldError>
            {t(
              `attendance.errors.${
                [
                  "invalidInput",
                  "notAuthorized",
                  "conflict",
                  "notEligible",
                  "uncertain",
                  "saveFailed",
                ].includes(errorCode)
                  ? errorCode
                  : "saveFailed"
              }`,
            )}
          </FieldError>
        )}

        {uncertain && (
          <p className="text-sm text-muted-foreground">{t("attendance.uncertainHelp")}</p>
        )}

        {conflict && (
          <p className="text-sm text-muted-foreground">{t("attendance.conflictHelp")}</p>
        )}

        {(uncertain || conflict || errorCode === "notEligible") && (
          <Button type="button" variant="outline" disabled={saving} onClick={checkLatest}>
            {t("checkLatest")}
          </Button>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={close}>
            {t("cancel")}
          </Button>

          {uncertain ? (
            <Button type="button" disabled={saving} onClick={() => submit(true)}>
              {saving ? t("saving") : t("retryExact")}
            </Button>
          ) : (
            <Button type="button" disabled={saving || conflict} onClick={() => submit()}>
              {saving ? t("saving") : t(`attendance.confirm.${kind}`)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
