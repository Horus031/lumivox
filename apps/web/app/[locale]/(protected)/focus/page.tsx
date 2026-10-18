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
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getActiveFocusV2Snapshot } from "@/features/focus-sessions/focus-v2.queries";

async function FocusRagSection({ focusSessionId }: { focusSessionId: string }) {
  const [documents, ragDefaults] = await Promise.all([
    getAccessibleProcessedLearningDocuments(),
    getRagDefaultSettings(),
  ]);

  return (
    <RagStudyAssistant
      compact
      className="min-w-0 rounded-lg border-border bg-card p-card shadow-none"
      focusSessionId={focusSessionId}
      documents={documents}
      defaultTopK={ragDefaults.defaultTopK}
      defaultPromptVariant={ragDefaults.defaultPromptVariant}
    />
  );
}

function RagLoadingFallback() {
  return (
    <div aria-hidden="true" className="h-64 animate-pulse rounded-lg border border-border bg-muted" />
  );
}

export default async function FocusPage() {
  if (process.env.FOCUS_V2_ENABLED === "true") {
    const activeV2 = await getActiveFocusV2Snapshot();
    if (activeV2) redirect(`/${await getLocale()}/focus-v2-lab`);
  }
  const [tasks, activeSession, recentSessions, t] = await Promise.all([
    getAvailableFocusTasks(),
    getActiveFocusSession(),
    getRecentFocusSessions(),
    getTranslations("focus.page"),
  ]);

  return (
    <section>
      <div className="mx-auto min-w-0 space-y-section">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <div className="grid min-w-0 items-start gap-card xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-card">
            {activeSession ? (
              <>
                <ActiveFocusSessionPanel session={activeSession} />
                <Suspense fallback={<RagLoadingFallback />}>
                  <FocusRagSection focusSessionId={activeSession.id} />
                </Suspense>
              </>
            ) : (
              <StartFocusSessionForm tasks={tasks} />
            )}
          </div>

          <RecentFocusSessions sessions={recentSessions} />
        </div>
      </div>
    </section>
  );
}
