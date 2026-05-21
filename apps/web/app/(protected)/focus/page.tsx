import { getTasks } from "@/features/tasks/task.queries";
import {
  getActiveFocusSession,
  getRecentFocusSessions,
} from "@/features/focus-sessions/focus-session.queries";

import { StartFocusSessionForm } from "@/features/focus-sessions/components/start-focus-session-form";
import { ActiveFocusSessionPanel } from "@/features/focus-sessions/components/active-focus-session-panel";
import { RecentFocusSessions } from "@/features/focus-sessions/components/recent-focus-sessions";

import type { FocusSessionWithTask } from "@/features/focus-sessions/focus-session.types";
import { PageHeader } from "@/features/app-shell/components/page-header";

export default async function FocusPage() {
  const [tasks, activeSession, recentSessions] = await Promise.all([
    getTasks(),
    getActiveFocusSession(),
    getRecentFocusSessions(),
  ]);

  const availableTasks = tasks.filter(
    (task) => task.status !== "completed" && task.status !== "cancelled",
  );

  return (
    <section className="px-4 py-6 md:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader
          eyebrow="Lumivox"
          title="Focus Sessions"
          description="Track intentional study sessions, log interruptions, and build meaningful behavioural evidence for the analytics layer."
        />

        {activeSession ? (
          <ActiveFocusSessionPanel
            session={activeSession as FocusSessionWithTask}
          />
        ) : (
          <StartFocusSessionForm tasks={availableTasks} />
        )}

        <RecentFocusSessions
          sessions={recentSessions as FocusSessionWithTask[]}
        />
      </div>
    </section>
  );
}
