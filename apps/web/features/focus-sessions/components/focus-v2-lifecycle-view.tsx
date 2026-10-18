"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowRight, BookOpen, Check, CirclePause, CirclePlay, Expand, Minimize2, RotateCcw, SkipForward, X } from "lucide-react";
import { useFocusV2Timer } from "../use-focus-v2-timer";
import { formatFocusV2Clock, getFocusV2LifecycleStats } from "../focus-v2-lifecycle.model";
import type { FocusV2Action, FocusV2Segment, FocusV2Snapshot } from "../focus-v2.types";

type Props = { initialSnapshot: FocusV2Snapshot; taskTitle: string | null };

type TerminalStatus = "completed" | "cancelled";

function kindKey(kind: FocusV2Segment["segment_kind"]): "focus" | "shortBreak" | "longBreak" {
  return kind === "focus" ? "focus" : kind === "short_break" ? "shortBreak" : "longBreak";
}

function segmentStatusKey(status: FocusV2Segment["status"]):
  "pending" | "running" | "paused" | "completed" | "skipped" | "interrupted" {
  switch (status) {
    case "pending":
    case "running":
    case "paused":
    case "completed":
    case "skipped":
    case "interrupted":
      return status;
    default:
      return "pending";
  }
}

export function FocusV2LifecycleView({ initialSnapshot, taskTitle }: Props) {
  const router = useRouter();
  const t = useTranslations("focus.live");
  const { snapshot, projection, error, isPending, online, refresh, transition } = useFocusV2Timer(initialSnapshot);
  const [immersive, setImmersive] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const busy = localBusy || isPending;
  const stats = getFocusV2LifecycleStats(snapshot, projection);
  const live = projection.current;
  const upcoming = projection.next;
  const terminal = projection.phase === "completed" || projection.phase === "cancelled";
  const waiting = projection.phase === "awaiting_next";
  const inBreak = !!live && live.segment_kind !== "focus";
  const paused = projection.phase === "paused";
  const phaseKind = live?.segment_kind ?? upcoming?.segment_kind ?? "focus";
  const phaseName = t(`kinds.${kindKey(phaseKind)}`);
  const terminalStatus = projection.phase as TerminalStatus;
  const mainHeading = terminal ? t(`terminal.${terminalStatus}`) : waiting ? t("waitingTitle") : phaseName;
  const running = projection.phase === "running";
  const activeId = live?.id ?? null;
  const nextId = upcoming?.id ?? null;

  useEffect(() => {
    if (!immersive) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setImmersive(false);
    }
    window.addEventListener("keydown", onKeyDown);
    dismissRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [immersive]);

  useEffect(() => {
    if (!immersive && restoreFocusRef.current) {
      restoreFocusRef.current.focus();
      restoreFocusRef.current = null;
    }
  }, [immersive]);

  async function perform(action: FocusV2Action, segmentId: string | null) {
    if (busy || !online) return;
    if (action === "cancel" && !window.confirm(t("cancelConfirm"))) return;
    setLocalBusy(true);
    try {
      const success = await transition(action, segmentId);
      if (success && action === "cancel") {
        setImmersive(false);
        router.refresh();
      }
    } finally {
      setLocalBusy(false);
    }
  }

  function toggleImmersive() {
    if (!immersive) restoreFocusRef.current = document.activeElement as HTMLElement;
    setImmersive((value) => !value);
  }

  const disable = busy || !online;
  return (
    <section aria-busy={busy} className={cn(
      "min-w-0 space-y-card rounded-lg border border-border bg-card p-card",
      immersive && "fixed inset-0 z-50 overflow-y-auto rounded-none border-0 bg-background p-5 sm:p-10",
    )}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-caption text-muted-foreground">{t("eyebrow")}</p>
          <h2 className="text-section font-semibold [overflow-wrap:anywhere]">{taskTitle ?? t("generalStudy")}</h2>
          <p className="text-caption text-muted-foreground">{t("roundOf", { current: stats.currentRound, total: stats.roundCount })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{mainHeading}</Badge>
          <Button ref={dismissRef} type="button" size="icon" variant="outline"
            aria-label={immersive ? t("exitImmersive") : t("immersive")}
            title={immersive ? t("exitImmersive") : t("immersive")}
            aria-pressed={immersive} onClick={toggleImmersive}>
            {immersive ? <Minimize2 aria-hidden="true" /> : <Expand aria-hidden="true" />}
          </Button>
        </div>
      </div>

      <div className={cn("space-y-3 rounded-lg bg-muted/40 p-4 text-center", immersive && "mx-auto w-full max-w-3xl py-10 sm:py-16")}>
        <div className="flex items-center justify-center gap-2 text-label font-medium">
          {inBreak || (waiting && phaseKind !== "focus")
            ? <CirclePause aria-hidden="true" className="size-5" />
            : <BookOpen aria-hidden="true" className="size-5" />}
          <span>{mainHeading}</span>
        </div>
        {terminal ? (
          <p role="status" className="text-3xl font-semibold">{t("terminalSummary")}</p>
        ) : waiting ? (
          <p role="status" className="text-2xl font-semibold">{t("readyForNext")}</p>
        ) : projection.phase === "invalid" ? (
          <p role="alert" className="text-body text-destructive">{t("invalidState")}</p>
        ) : (
          <p role="timer" aria-live="off" aria-label={t("remaining")}
            suppressHydrationWarning className="text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl">
            {formatFocusV2Clock(projection.remainingSeconds)}
          </p>
        )}
        {!terminal && !waiting && live && (
          <div role="progressbar" aria-label={t("segmentProgress")} aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(projection.progressPercent)}
            className="h-2 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${projection.progressPercent}%` }} />
          </div>
        )}
        {paused && <p className="text-caption text-muted-foreground">{t("pausedHelp")}</p>}
        {projection.isDue && <p role="status" className="text-caption text-muted-foreground">{t("finishing")}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {running && live && !projection.isDue && (
          <Button type="button" disabled={disable} variant="outline" onClick={() => void perform("pause", activeId)}>
            <CirclePause aria-hidden="true" /> {t("pause")}
          </Button>
        )}
        {paused && live && (
          <Button type="button" disabled={disable} onClick={() => void perform("resume", activeId)}>
            <CirclePlay aria-hidden="true" /> {t("resume")}
          </Button>
        )}
        {waiting && nextId && (
          <Button type="button" disabled={disable} onClick={() => void perform("start_next", nextId)}>
            <ArrowRight aria-hidden="true" /> {t("startNext", { phase: phaseName })}
          </Button>
        )}
        {running && projection.isDue && live && (
          <Button type="button" disabled={disable} onClick={() => void perform("complete", activeId)}>
            <Check aria-hidden="true" /> {t("finishSegment")}
          </Button>
        )}
        {running && inBreak && live && (
          <Button type="button" disabled={disable} variant="secondary" onClick={() => void perform("skip_break", activeId)}>
            <SkipForward aria-hidden="true" /> {t("skipBreak")}
          </Button>
        )}
        {!terminal && (
          <Button type="button" disabled={disable} variant="outline" onClick={() => void perform("cancel", activeId)}>
            <X aria-hidden="true" /> {t("cancel")}
          </Button>
        )}
        {terminal && (
          <Button type="button" onClick={() => { setImmersive(false); router.refresh(); }}>
            <RotateCcw aria-hidden="true" /> {t("newSession")}
          </Button>
        )}
        <Button type="button" disabled={busy || !online} variant="ghost" onClick={() => void refresh()}>
          <RotateCcw aria-hidden="true" /> {t("sync")}
        </Button>
      </div>

      {!online && <p role="alert" className="text-body text-destructive">{t("offline")}</p>}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 p-3 text-body text-destructive">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label={t("completedRounds")} value={`${stats.completedRounds}/${stats.roundCount}`} />
        <Metric label={t("focusTime")} value={formatFocusV2Clock(terminal ? snapshot.session.actual_focus_minutes * 60 : stats.displayedFocusSeconds)} />
        <Metric label={t("breakTime")} value={formatFocusV2Clock(stats.displayedBreakSeconds)} />
      </div>

      <div className="space-y-3">
        <h3 className="text-label font-semibold">{t("timeline")}</h3>
        <ol className="grid gap-2 sm:grid-cols-2" aria-label={t("timeline")}>
          {snapshot.segments.map((segment) => {
            const isCurrent = segment.id === live?.id || (waiting && segment.id === upcoming?.id);
            return (
              <li key={segment.id} aria-current={isCurrent ? "step" : undefined}
                className={cn("min-w-0 rounded-lg border border-border p-3", isCurrent && "border-primary bg-primary/5")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-label font-medium">{t("round", { number: segment.round_number })} · {t(`kinds.${kindKey(segment.segment_kind)}`)}</span>
                  <Badge variant="secondary">{t(`statuses.${segmentStatusKey(segment.status)}`)}</Badge>
                </div>
                <p className="mt-1 text-caption text-muted-foreground">{t("plannedDuration", { minutes: Math.floor(segment.planned_seconds / 60) })}</p>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="text-caption text-muted-foreground">{t("noAutoSound")}</p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p suppressHydrationWarning className="mt-1 text-label font-semibold tabular-nums">{value}</p>
    </div>
  );
}
