"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getStudySessionsAction } from "../session.queries.actions";
import { SessionRescheduleDialog } from "./session-reschedule-dialog";

type SuccessResult = Extract<Awaited<ReturnType<typeof getStudySessionsAction>>, { success: true }>;
type Session = SuccessResult["sessions"][number];
type Props = { scheduleId: string; canReschedule?: boolean };

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled", in_progress: "In progress", completed: "Completed",
  missed: "Missed", skipped: "Skipped", cancelled: "Cancelled",
};

export function StudySessionsList({ scheduleId, canReschedule = false }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  // Keep the reset synchronous when the viewed schedule changes, including
  // callers other than the keyed Task section.
  return <SessionRows key={`${scheduleId}-${canReschedule}-${refreshKey}`} scheduleId={scheduleId}
    canReschedule={canReschedule} onReload={() => setRefreshKey(key => key + 1)} />;
}

function SessionRows({ scheduleId, canReschedule, onReload }: Props & { onReload: () => void }) {
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
        setError(result.message);
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
        setError(requestedPage === 0 ? "Unable to load sessions." : "Unable to load more sessions.");
        setRetryPage(requestedPage);
      }
    } finally {
      if (version === requestVersion.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, [scheduleId]);

  useEffect(() => {
    void loadPage(0);
    return () => { requestVersion.current += 1; inFlight.current = false; };
  }, [loadPage]);

  return (
    <section aria-label="Study sessions" aria-busy={loading} className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Study sessions</h4>
        <span className="text-xs text-muted-foreground">{sessions.length} of {total}</span>
      </div>
      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-red-600">{error}</p>
          <Button type="button" variant="outline" disabled={loading}
            onClick={() => void loadPage(retryPage)}>Retry</Button>
        </div>
      )}
      {!loading && sessions.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No study sessions found.</p>
      )}
      <ul className="space-y-2">
        {sessions.map(session => (
          <li key={session.id} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{session.local_date}</p>
                <p className="text-xs text-muted-foreground">
                  {session.local_start_time.slice(0, 5)} – {session.local_end_time.slice(0, 5)} · {session.timezone}
                </p>
              </div>
              <span className="rounded-md border px-2 py-1 text-xs">
                {STATUS_LABELS[session.status] ?? session.status}
              </span>
              {canReschedule && session.status === "scheduled" &&
                new Date(session.scheduled_start_at).getTime() > Date.now() && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setSelectedSession(session)}>
                    Reschedule
                  </Button>
                )}
            </div>
            {session.status === "cancelled" && session.cancellation_reason && (
              <p className="mt-2 text-xs text-muted-foreground">Reason: {session.cancellation_reason}</p>
            )}
          </li>
        ))}
      </ul>
      {selectedSession && <SessionRescheduleDialog session={selectedSession} open
        onOpenChange={open => { if (!open) setSelectedSession(null); }}
        onSaved={onReload} onReload={onReload} />}
      {loading && <p role="status" className="text-sm">Loading sessions...</p>}
      {hasMore && !error && (
        <Button type="button" variant="outline" disabled={loading || selectedSession !== null}
          onClick={() => void loadPage(page + 1)}>Load more</Button>
      )}
    </section>
  );
}
