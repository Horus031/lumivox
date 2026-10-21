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
import { getActiveFocusV2Snapshot } from "@/features/focus-sessions/focus-v2.queries";
import { getFocusV2Preferences } from "@/features/focus-sessions/focus-v2-preferences.queries";
import { FocusV2SessionBuilder } from "@/features/focus-sessions/components/focus-v2-session-builder";
import { FocusV2LifecycleView } from "@/features/focus-sessions/components/focus-v2-lifecycle-view";
import { FocusV2AnalyticsDashboard } from "@/features/focus-sessions/components/focus-v2-analytics-dashboard";
import { isFocusV2CreationEnabled } from "@/features/focus-sessions/focus-v2-release";

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

export default async function FocusPage({ searchParams }: { searchParams: Promise<{ focusPeriod?: string }> }) {
  const { focusPeriod } = await searchParams;
  const analyticsDays: 7 | 30 = focusPeriod === "7" ? 7 : 30;
  const activeV2 = process.env.FOCUS_V2_ENABLED === "true"
    ? await getActiveFocusV2Snapshot()
    : null;
  const [tasks, activeSession, recentSessions, t] = await Promise.all([
    getAvailableFocusTasks(),
    getActiveFocusSession(),
    getRecentFocusSessions(),
    getTranslations("focus.page"),
  ]);
  const initialPreferences = isFocusV2CreationEnabled() && !activeSession && !activeV2
    ? await getFocusV2Preferences()
    : null;

  return (
    <section>
      <div className="mx-auto space-y-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <div className="grid min-w-0 items-start gap-card xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-card">
            {activeV2 ? (
              <>
                <FocusV2LifecycleView
                  initialSnapshot={activeV2}
                  taskTitle={tasks.find((task) => task.id === activeV2.session.task_id)?.title ?? null}
                />
                <Suspense fallback={<RagLoadingFallback />}>
                  <FocusRagSection focusSessionId={activeV2.session.id} />
                </Suspense>
              </>
            ) : activeSession ? (
              <>
                <ActiveFocusSessionPanel session={activeSession} />
                <Suspense fallback={<RagLoadingFallback />}>
                  <FocusRagSection focusSessionId={activeSession.id} />
                </Suspense>
              </>
            ) : (
              initialPreferences
                ? <FocusV2SessionBuilder tasks={tasks} initialPreferences={initialPreferences} />
                : <StartFocusSessionForm tasks={tasks} />
            )}
          </div>

          <RecentFocusSessions sessions={recentSessions} />
        </div>
        {process.env.FOCUS_V2_ENABLED === "true" && (
          <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" aria-hidden="true" />}>
            <FocusV2AnalyticsDashboard days={analyticsDays} />
          </Suspense>
        )}
      </div>
    </section>
  );
}
