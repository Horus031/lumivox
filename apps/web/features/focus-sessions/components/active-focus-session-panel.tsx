"use client";

import { useConfirmDialog } from "@/components/ui/use-confirm-dialog";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { getRemainingFocusSeconds } from "../focus-session-clock";
import type { ActiveFocusSessionWithTask } from "@/features/focus-sessions/focus-session.types";
import {
  cancelFocusSessionAction,
  completeFocusSessionAction,
  pauseFocusSessionAction,
  resumeFocusSessionAction,
} from "@/features/focus-sessions/focus-session.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type ActiveFocusSessionPanelProps = {
  session: ActiveFocusSessionWithTask;
};

function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);

  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}`;
}

export function ActiveFocusSessionPanel({
  session,
}: ActiveFocusSessionPanelProps) {
  const panelId = useId();
  const router = useRouter();
  const t = useTranslations("focus.active");
  const confirm = useConfirmDialog();
  const [isPending, startTransition] = useTransition();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isCompletingOptimistically, setIsCompletingOptimistically] =
    useState(false);

  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getRemainingFocusSeconds(session),
  );

  useEffect(() => {
    setRemainingSeconds(getRemainingFocusSeconds(session));

    if (session.status === "paused") return;

    const interval = window.setInterval(() => {
      setRemainingSeconds(getRemainingFocusSeconds(session));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [session]);

  const timerText = useMemo(
    () => formatClock(remainingSeconds),
    [remainingSeconds],
  );
  const isOngoing = session.status === "ongoing";
  const displayedStatus = isCompletingOptimistically
    ? "completed"
    : session.status;
  const areActionsDisabled = isPending || isCompletingOptimistically;

  function handlePause() {
    startTransition(async () => {
      try {
        const result = await pauseFocusSessionAction(session.id);

        if (!result.success) {
          toast.error(result.message);
          if (result.message === "Session state changed. Please refresh.") router.refresh();
          return;
        }

        toast.success(result.message);
        router.refresh();
      } catch {
        toast.error(t("requestFailed"));
      }
    });
  }

  function handleResume() {
    startTransition(async () => {
      try {
        const result = await resumeFocusSessionAction(session.id);

        if (!result.success) {
          toast.error(result.message);
          if (result.message === "Session state changed. Please refresh.") router.refresh();
          return;
        }

        toast.success(result.message);
        router.refresh();
      } catch {
        toast.error(t("requestFailed"));
      }
    });
  }

  function handleComplete() {
    setIsCompletingOptimistically(true);

    startTransition(async () => {
      try {
        const result = await completeFocusSessionAction(session.id);
        if (!result.success) {
          setIsCompletingOptimistically(false);
          toast.error(result.message);
          if (result.message === "Session state changed. Please refresh.") router.refresh();
          return;
        }
        toast.success(result.message);
        router.refresh();
      } catch {
        setIsCompletingOptimistically(false);
        toast.error(t("requestFailed"));
      }
    });
  }

  async function handleCancel() {
    const confirmed = await confirm(t("cancelConfirm"), { variant: "destructive", title: t("actions.cancel"), confirmLabel: t("actions.cancel") });

    if (!confirmed) return;

    startTransition(async () => {
      try {
        const result = await cancelFocusSessionAction(session.id);

        if (!result.success) {
          toast.error(result.message);
          if (result.message === "Session state changed. Please refresh.") router.refresh();
          return;
        }

        toast.success(result.message);
        router.refresh();
      } catch {
        toast.error(t("requestFailed"));
      }
    });
  }

  const actionButtons = (
    <div className="flex shrink-0 items-center gap-1">
      <Button type="button" variant="ghost" size="icon"
        aria-label={t(isOngoing ? "actions.pause" : "actions.resume")}
        title={t(isOngoing ? "actions.pause" : "actions.resume")}
        onClick={isOngoing ? handlePause : handleResume}
        disabled={areActionsDisabled} className="sm:size-touch lg:size-control">
        {isOngoing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </Button>
      <Button type="button" size="icon" aria-label={t("actions.complete")}
        title={t("actions.complete")} onClick={handleComplete}
        disabled={areActionsDisabled || !isOngoing} className="sm:size-touch lg:size-control">
        <Check aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon" aria-label={t("actions.cancel")}
        title={t("actions.cancel")} onClick={handleCancel}
        disabled={areActionsDisabled} className="sm:size-touch lg:size-control hover:bg-danger/10">
        <X aria-hidden="true" />
      </Button>
    </div>
  );

  const progress = Math.min(100, Math.max(0, (1 - remainingSeconds / (session.planned_minutes * 60)) * 100));

  return (
    <section aria-busy={isPending} className="min-w-0 rounded-lg border border-border bg-card p-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-caption text-muted-foreground">{t("eyebrow")}</p>
          <h2 title={session.tasks?.title ?? t("generalSession")}
            className="text-section font-semibold [overflow-wrap:anywhere]">
            {session.tasks?.title ?? t("generalSession")}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t(`status.${displayedStatus}`)}</Badge>
            <span className="text-caption text-muted-foreground">
              {t("plannedBadge", { minutes: session.planned_minutes })}
            </span>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="shrink-0 sm:size-touch lg:size-control"
          aria-label={t(isCollapsed ? "actions.expand" : "actions.collapse")}
          title={t(isCollapsed ? "actions.expand" : "actions.collapse")}
          aria-expanded={!isCollapsed} aria-controls={panelId}
          onClick={() => setIsCollapsed((value) => !value)}>
          {isCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-card">
        <div className="min-w-0">
          <p className="mb-1 text-caption text-muted-foreground">{t("remainingTime")}</p>
          <p role="timer" aria-label={t("remainingTime")} aria-live="off" suppressHydrationWarning
            className={cn("font-semibold tabular-nums", isCollapsed ? "text-metric" : "text-4xl", remainingSeconds <= 0 ? "text-success" : "text-foreground")}>
            {timerText}
          </p>
        </div>
        {actionButtons}
      </div>
      <div id={panelId} hidden={isCollapsed} className="mt-4">
        <div role="progressbar" aria-label={t("progress")} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(progress)} aria-valuetext={t("compactProgress", { remaining: timerText, minutes: session.planned_minutes })}
          className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary dark:bg-success" style={{ width: `${progress}%` }} />
        </div>
      </div>
      {remainingSeconds <= 0 ? (
        <p className="mt-3 text-body text-secondary-text">{t("durationReached")}</p>
      ) : null}
    </section>
  );
}
