import type { FocusSessionWithTask } from "@/features/focus-sessions/focus-session.types";

type RecentFocusSessionsProps = {
  sessions: FocusSessionWithTask[];
};

export function RecentFocusSessions({ sessions }: RecentFocusSessionsProps) {
  return (
    <section className="rounded-2xl space-y-4 bg-background border p-6">
      <div>
        <h2 className="text-xs text-foreground uppercase font-semibold">
          Recent focus sessions
        </h2>
      </div>

      {sessions.length === 0 ? (
        <div className="p-10 text-center">
          <h3 className="text-lg font-semibold">No focus sessions yet</h3>
          <p className="mt-2 text-sm text-foreground">
            Start your first session to begin collecting behavioural data.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <article
              key={session.id}
              className="shadow-sm border-b py-2"
            >
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <h3 className="font-semibold text-[13px]">
                    {session.tasks?.title ?? "General focus session"}
                  </h3>

                  <p className="mt-1 text-[11px] text-neutral-600">
                    Planned {session.planned_minutes} min · Actual{" "}
                    {session.actual_focus_minutes} min
                  </p>
                </div>

                <span className="w-fit rounded font-mono text-xs bg-surface px-3 py-1 font-semibold capitalize">
                  {session.status}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
