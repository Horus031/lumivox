import { getTaskById, getTasks } from "@/features/tasks/task.queries";
import {
  getActiveFocusSession,
  getRecentFocusSessions,
} from "@/features/focus-sessions/focus-session.queries";

import { StartFocusSessionForm } from "@/features/focus-sessions/components/start-focus-session-form";
import { ActiveFocusSessionPanel } from "@/features/focus-sessions/components/active-focus-session-panel";
import { RecentFocusSessions } from "@/features/focus-sessions/components/recent-focus-sessions";

import type { FocusSessionWithTask } from "@/features/focus-sessions/focus-session.types";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { getAccessibleProcessedLearningDocuments } from "@/features/learning-documents/learning-document.queries";
import { RagStudyAssistant } from "@/features/rag/components/rag-study-assistant";
import { getRagDefaultSettings } from "@/features/cms-settings/cms-settings.queries";
import { getTranslations } from "next-intl/server";

export default async function FocusPage() {
  const [tasks, activeSession, recentSessions, documents, ragDefaults, t] =
    await Promise.all([
      getTasks(),
      getActiveFocusSession(),
      getRecentFocusSessions(),
      getAccessibleProcessedLearningDocuments(),
      getRagDefaultSettings(),
      getTranslations("focus.page"),
    ]);

  const task = await getTaskById(activeSession?.task_id ?? null);

  const availableTasks = tasks.filter(
    (task) => task.status !== "completed" && task.status !== "cancelled",
  );

  return (
    <section className="px-4 py-6 md:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        {activeSession ? (
          <div className="flex flex-col gap-4">
            <ActiveFocusSessionPanel
              session={activeSession as FocusSessionWithTask}
              task={task}
            />

            <RagStudyAssistant
              focusSessionId={activeSession?.id ?? null}
              documents={documents}
              defaultTopK={ragDefaults.defaultTopK}
              defaultPromptVariant={ragDefaults.defaultPromptVariant}
            />
          </div>
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
