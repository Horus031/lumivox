"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatStudyDate } from "../schedule-presentation";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { getStudySessionsAction } from "../session.queries.actions";
import { SessionRescheduleDialog } from "./session-reschedule-dialog";
import { SessionAttendanceDialog } from "./session-attendance-dialog";

import type { AttendanceCommand } from "../session-attendance.actions";

type SuccessResult = Extract<Awaited<ReturnType<typeof getStudySessionsAction>>, { success: true }>;
type Session = SuccessResult["sessions"][number];
const attendanceActions: Partial<Record<Session["status"], AttendanceCommand["command"][]>> = {
  scheduled: ["start", "complete", "skip"],
  in_progress: ["complete"],
  missed: ["recover", "skip"],
  skipped: ["recover"],
};

type Props = {
  scheduleId: string;
  canReschedule?: boolean;
  canAttend?: boolean;
};

export function StudySessionsList({ scheduleId, canReschedule = false, canAttend = false }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <SessionRows
      key={`${scheduleId}-${canReschedule}-${canAttend}-${refreshKey}`}
      scheduleId={scheduleId}
      canReschedule={canReschedule}
      canAttend={canAttend}
      onReload={() => setRefreshKey((key) => key + 1)}
    />
  );
}

function SessionRows({
  scheduleId,
  canReschedule,
  canAttend,
  onReload,
}: Props & { onReload: () => void }) {
  const t = useTranslations("learningSchedule");
  const locale = useLocale();
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  type SelectedAttendance = {
    session: Session;
    kind: AttendanceCommand["command"];
  };

  const [selectedAttendance, setSelectedAttendance] = useState<SelectedAttendance | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryPage, setRetryPage] = useState(0);
  const requestVersion = useRef(0);
  const inFlight = useRef(false);
  // State alone cannot serialize two clicks before the next React render.
  const dialogOpen = useRef(false);

  function openAttendance(session: Session, kind: AttendanceCommand["command"]) {
    if (!canAttend || loading || inFlight.current || dialogOpen.current) {
      return;
    }

    dialogOpen.current = true;
    setSelectedAttendance({ session, kind });
  }

  function openReschedule(session: Session) {
    if (!canReschedule || loading || inFlight.current || dialogOpen.current) return;
    dialogOpen.current = true;
    setSelectedSession(session);
  }

  const loadPage = useCallback(
    async (requestedPage: number) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const version = ++requestVersion.current;
      setLoading(true);
      setError(null);
      try {
        const result = await getStudySessionsAction({
          scheduleId,
          page: requestedPage,
        });
        if (version !== requestVersion.current) return;
        if (!result.success) {
          setError(t(`errors.${result.code ?? "loadFailed"}`));
          setRetryPage(requestedPage);
          return;
        }
        setSessions((current) => {
          const rows = requestedPage === 0 ? [] : current;
          const byId = new Map(rows.map((item) => [item.id, item]));
          for (const item of result.sessions) if (!byId.has(item.id)) byId.set(item.id, item);
          return [...byId.values()];
        });
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch {
        if (version === requestVersion.current) {
          setError(t("errors.loadFailed"));
          setRetryPage(requestedPage);
        }
      } finally {
        if (version === requestVersion.current) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [scheduleId, t],
  );

  useEffect(() => {
    void loadPage(0);
    return () => {
      requestVersion.current += 1;
      inFlight.current = false;
    };
  }, [loadPage]);

  const actionsDisabled = loading || selectedSession !== null || selectedAttendance !== null;

  return (
    <section
      aria-label={t("sessions")}
      aria-busy={loading}
      className="min-w-0 space-y-3 [overflow-wrap:anywhere]"
    >
      <div className="flex items-center justify-between">
        <h4 data-study-sessions-heading tabIndex={-1} className="text-label font-semibold">
          {t("sessions")}
        </h4>
        <span className="text-caption text-muted-foreground">
          {t("loadedCount", { count: sessions.length, total })}
        </span>
      </div>
      {error && (
        <div className="space-y-2">
          <FieldError>{error}</FieldError>
          <Button
            type="button"
            variant="outline"
            disabled={actionsDisabled}
            onClick={() => void loadPage(retryPage)}
          >
            {t("retry")}
          </Button>
        </div>
      )}
      {!loading && sessions.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">{t("noSessions")}</p>
      )}
      <ul className="divide-y divide-border rounded-md border border-border empty:hidden">
        {sessions.map((session) => (
          <li key={session.id} className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <time dateTime={session.local_date} className="text-label font-semibold">{formatStudyDate(session.local_date, locale)}</time>
                  <Badge variant="outline">{t(`status.${session.status}`)}</Badge>
                </div>
                <p className="text-caption text-muted-foreground">
                  {session.local_start_time.slice(0, 5)} – {session.local_end_time.slice(0, 5)} ·{" "}
                  {session.timezone}
                </p>
              </div>
              <div
                role="group"
                aria-label={t("attendanceActionsLabel")}
                className="ms-auto flex flex-wrap items-center justify-end gap-1 empty:hidden"
              >
                {canReschedule &&
                  session.status === "scheduled" &&
                  new Date(session.scheduled_start_at).getTime() > Date.now() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={actionsDisabled}
                      onClick={() => openReschedule(session)}
                    >
                      {t("reschedule")}
                    </Button>
                  )}
                {canAttend && attendanceActions[session.status]?.map((kind) => (
                  <Button
                    key={kind}
                    type="button"
                    size="sm"
                    variant={kind === "complete" || kind === "recover" ? "default" : "ghost"}
                    disabled={actionsDisabled}
                    onClick={() => openAttendance(session, kind)}
                  >
                    {t(`attendance.action.${kind}`)}
                  </Button>
                ))}
              </div>
            </div>
            {session.status === "cancelled" && session.cancellation_reason && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("reason")}:{" "}
                {t(
                  `reasonCode.${["task_closed", "schedule_changed"].includes(session.cancellation_reason) ? session.cancellation_reason : "other"}`,
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
      {selectedSession && (
        <SessionRescheduleDialog
          session={selectedSession}
          open
          onOpenChange={(open) => {
            if (!open) {
              dialogOpen.current = false;
              setSelectedSession(null);
            }
          }}
          onSaved={onReload}
          onReload={onReload}
        />
      )}
      {selectedAttendance && (
        <SessionAttendanceDialog
          session={selectedAttendance.session}
          kind={selectedAttendance.kind}
          open
          onOpenChange={(open) => {
            if (!open) {
              dialogOpen.current = false;
              setSelectedAttendance(null);
            }
          }}
          onSaved={onReload}
          onReload={onReload}
        />
      )}
      {loading && (
        <p role="status" className="text-sm">
          {t("loadingSessions")}
        </p>
      )}
      {hasMore && !error && (
        <Button
          type="button"
          variant="outline"
          disabled={actionsDisabled}
          onClick={() => void loadPage(page + 1)}
        >
          {t("loadMore")}
        </Button>
      )}
    </section>
  );
}
