import { Suspense } from "react";
import { getAvailableFocusTasks } from "@/features/tasks/task.queries";
import {
  getActiveFocusSession,
  getRecentFocusSessions,
} from "@/features/focus-sessions/focus-session.queries";

import { StartFocusSessionForm } from "@/features/focus-sessions/components/start-focus-session-form";
import { ActiveFocusSessionPanel } from "@/features/focus-sessions/components/active-focus-session-panel";
import { RecentFocusSessions } from "@/features/focus-sessions/components/recent-focus-sessions";

import { PageHeader } from "@/features/app-shell/components/page-header";
import { getAccessibleProcessedLearningDocuments } from "@/features/learning-documents/learning-document.queries";
import { RagStudyAssistant } from "@/features/rag/components/rag-study-assistant";
import { getRagDefaultSettings } from "@/features/cms-settings/cms-settings.queries";
import { getTranslations } from "next-intl/server";

async function FocusRagSection({ focusSessionId }: { focusSessionId: string }) {
  const [documents, ragDefaults] = await Promise.all([
    getAccessibleProcessedLearningDocuments(),
    getRagDefaultSettings(),
  ]);

  return (
    <RagStudyAssistant
      focusSessionId={focusSessionId}
      documents={documents}
      defaultTopK={ragDefaults.defaultTopK}
      defaultPromptVariant={ragDefaults.defaultPromptVariant}
    />
  );
}

function RagLoadingFallback() {
  return (
    <div className="h-64 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
  );
}

export default async function FocusPage() {
  const [tasks, activeSession, recentSessions, t] = await Promise.all([
    getAvailableFocusTasks(),
    getActiveFocusSession(),
    getRecentFocusSessions(),
    getTranslations("focus.page"),
  ]);

  return (
    <section>
      <div className="mx-auto space-y-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        {activeSession ? (
          <div className="flex flex-col gap-4">
            <ActiveFocusSessionPanel session={activeSession} />

            <Suspense fallback={<RagLoadingFallback />}>
              <FocusRagSection focusSessionId={activeSession.id} />
            </Suspense>
          </div>
        ) : (
          <StartFocusSessionForm tasks={tasks} />
        )}

        <RecentFocusSessions sessions={recentSessions} />
      </div>
    </section>
  );
}
