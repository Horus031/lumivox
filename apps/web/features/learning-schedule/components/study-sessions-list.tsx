"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatStudyDate } from "../schedule-presentation";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getStudySessionsAction } from "../session.queries.actions";
import { SessionRescheduleDialog } from "./session-reschedule-dialog";

type SuccessResult = Extract<Awaited<ReturnType<typeof getStudySessionsAction>>, { success: true }>;
type Session = SuccessResult["sessions"][number];
type Props = { scheduleId: string; canReschedule?: boolean };



export function StudySessionsList({ scheduleId, canReschedule = false }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  // Keep the reset synchronous when the viewed schedule changes, including
  // callers other than the keyed Task section.
  return <SessionRows key={`${scheduleId}-${canReschedule}-${refreshKey}`} scheduleId={scheduleId}
    canReschedule={canReschedule} onReload={() => setRefreshKey(key => key + 1)} />;
}

function SessionRows({ scheduleId, canReschedule, onReload }: Props & { onReload: () => void }) {
  const t = useTranslations("learningSchedule");
  const locale = useLocale();
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryPage, setRetryPage] = useState(0);
  const requestVersion = useRef(0);
  const inFlight = useRef(false);

  const loadPage = useCallback(async (requestedPage: number) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getStudySessionsAction({ scheduleId, page: requestedPage });
      if (version !== requestVersion.current) return;
      if (!result.success) {
        setError(t(`errors.${result.code ?? "loadFailed"}`));
        setRetryPage(requestedPage);
        return;
      }
      setSessions(current => {
        const rows = requestedPage === 0 ? [] : current;
        const byId = new Map(rows.map(item => [item.id, item]));
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
  }, [scheduleId, t]);

  useEffect(() => {
    void loadPage(0);
    return () => { requestVersion.current += 1; inFlight.current = false; };
  }, [loadPage]);

  return (
    <section aria-label={t("sessions")} aria-busy={loading} className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
      <div className="flex items-center justify-between">
        <h4 data-study-sessions-heading tabIndex={-1} className="font-medium">{t("sessions")}</h4>
        <span className="text-xs text-muted-foreground">{t("loadedCount", { count: sessions.length, total })}</span>
      </div>
      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-red-600">{error}</p>
          <Button type="button" variant="outline" disabled={loading}
            onClick={() => void loadPage(retryPage)}>{t("retry")}</Button>
        </div>
      )}
      {!loading && sessions.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">{t("noSessions")}</p>
      )}
      <ul className="space-y-2">
        {sessions.map(session => (
          <li key={session.id} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{formatStudyDate(session.local_date, locale)}</p>
                <p className="text-xs text-muted-foreground">
                  {session.local_start_time.slice(0, 5)} – {session.local_end_time.slice(0, 5)} · {session.timezone}
                </p>
              </div>
              <span className="rounded-md border px-2 py-1 text-xs">
                {t(`status.${session.status}`)}
              </span>
              {canReschedule && session.status === "scheduled" &&
                new Date(session.scheduled_start_at).getTime() > Date.now() && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setSelectedSession(session)}>{t("reschedule")}</Button>
                )}
            </div>
            {session.status === "cancelled" && session.cancellation_reason && (
              <p className="mt-2 text-xs text-muted-foreground">{t("reason")}: {t(`reasonCode.${["task_closed", "schedule_changed"].includes(session.cancellation_reason) ? session.cancellation_reason : "other"}`)}</p>
            )}
          </li>
        ))}
      </ul>
      {selectedSession && <SessionRescheduleDialog session={selectedSession} open
        onOpenChange={open => { if (!open) setSelectedSession(null); }}
        onSaved={onReload} onReload={onReload} />}
      {loading && <p role="status" className="text-sm">{t("loadingSessions")}</p>}
      {hasMore && !error && (
        <Button type="button" variant="outline" disabled={loading || selectedSession !== null}
          onClick={() => void loadPage(page + 1)}>{t("loadMore")}</Button>
      )}
    </section>
  );
}
