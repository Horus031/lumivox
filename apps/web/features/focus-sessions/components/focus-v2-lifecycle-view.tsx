"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useFocusV2Audio } from "../use-focus-v2-audio";
import { useFocusV2Attention } from "../use-focus-v2-attention";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowRight, BookOpen, Check, CirclePause, CirclePlay, Expand, Minimize2, RotateCcw, Settings2, SkipForward, X } from "lucide-react";
import { useFocusV2Timer } from "../use-focus-v2-timer";
import { FocusV2AudioControls } from "./focus-v2-audio-panel";
import { FocusV2AttentionControls } from "./focus-v2-attention-panel";
import { formatFocusV2Clock, getFocusV2LifecycleStats } from "../focus-v2-lifecycle.model";
import type { FocusV2Action, FocusV2Segment, FocusV2Snapshot } from "../focus-v2.types";

type Props = { initialSnapshot: FocusV2Snapshot; taskTitle: string | null; children?: ReactNode };

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

export function FocusV2LifecycleView({ initialSnapshot, taskTitle, children }: Props) {
  const router = useRouter();
  const t = useTranslations("focus.live");
  const { snapshot, projection, error, isPending, online, refresh, transition } = useFocusV2Timer(initialSnapshot);
  const audio = useFocusV2Audio(snapshot.session.id, projection);
  const attention = useFocusV2Attention(snapshot.session.id, projection);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLOListElement>(null);
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
      if (event.key === "Escape" && !event.defaultPrevented && !settingsOpen) setImmersive(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [immersive, settingsOpen]);

  useEffect(() => {
    if (!immersive) return;
    const composer = chatRef.current?.querySelector("textarea");
    if (composer) composer.focus({ preventScroll: true });
    else dismissRef.current?.focus();
  }, [immersive]);

  useEffect(() => {
    if (!immersive && restoreFocusRef.current) {
      restoreFocusRef.current.focus();
      restoreFocusRef.current = null;
    }
  }, [immersive]);

  useEffect(() => {
    if (!immersive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [immersive]);

  useEffect(() => {
    const list = timelineRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!list || !current) return;
    list.scrollTo?.({
      top: list.scrollHeight > list.clientHeight ? current.offsetTop : 0,
      left: list.scrollWidth > list.clientWidth ? current.offsetLeft : 0,
      behavior: "smooth",
    });
  }, [activeId, nextId, waiting]);

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
      "flex h-[calc(100dvh-11rem)] min-h-0 lg:h-[calc(100dvh-7rem)] lg:min-h-[36rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm",
      immersive && "fixed inset-0 z-[45] h-dvh lg:h-dvh lg:min-h-0 min-h-0 rounded-none border-0 bg-background",
    )}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-label font-semibold">{taskTitle ?? t("generalStudy")}</h2>
          <p className="text-caption text-muted-foreground">{t("roundOf", { current: stats.currentRound, total: stats.roundCount })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="hidden sm:inline-flex">{mainHeading}</Badge>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="icon" variant="outline" aria-label={t("settings")} title={t("settings")}>
                <Settings2 aria-hidden="true" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t("settings")}</DialogTitle>
                <DialogDescription>{t("settingsDescription")}</DialogDescription>
              </DialogHeader>
              <FocusV2AudioControls audio={audio} />
              <FocusV2AttentionControls attention={attention} sessionId={snapshot.session.id} projection={projection} />
            </DialogContent>
          </Dialog>
          <Button ref={dismissRef} type="button" size="icon" variant="outline"
            aria-label={immersive ? t("exitImmersive") : t("immersive")}
            title={immersive ? t("exitImmersive") : t("immersive")}
            aria-pressed={immersive} onClick={toggleImmersive}>
            {immersive ? <Minimize2 aria-hidden="true" /> : <Expand aria-hidden="true" />}
          </Button>
        </div>
      </div>

      <div className={cn("grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)] lg:grid-rows-1", immersive && "lg:grid-cols-[16rem_minmax(0,1fr)]")}>
        <aside aria-label={t("sessionOverview")} className="flex min-h-0 min-w-0 flex-col gap-3 border-b border-border bg-muted/20 p-3 lg:border-r lg:border-b-0 lg:p-4">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl bg-muted/40 p-2 text-center lg:block lg:space-y-2 lg:p-3">
          <div className="flex items-center justify-center gap-2 text-label font-medium">
            {inBreak || (waiting && phaseKind !== "focus")
              ? <CirclePause aria-hidden="true" className="size-5" />
              : <BookOpen aria-hidden="true" className="size-5" />}
            <span>{mainHeading}</span>
          </div>
          {terminal ? (
            <p role="status" className="col-span-2 text-xl font-semibold">{t("terminalSummary")}</p>
          ) : waiting ? (
            <p role="status" className="col-span-2 text-xl font-semibold">{t("readyForNext")}</p>
          ) : projection.phase === "invalid" ? (
            <p role="alert" className="text-body text-destructive">{t("invalidState")}</p>
          ) : (
            <p role="timer" aria-live="off" aria-label={t("remaining")}
              suppressHydrationWarning className="text-3xl font-semibold tabular-nums tracking-tight lg:text-5xl">
              {formatFocusV2Clock(projection.remainingSeconds)}
            </p>
          )}
          {!terminal && !waiting && live && (
            <div role="progressbar" aria-label={t("segmentProgress")} aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={Math.round(projection.progressPercent)}
              className="col-span-2 h-1.5 overflow-hidden rounded-full bg-background lg:h-2">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${projection.progressPercent}%` }} />
            </div>
          )}
          {paused && <p className="text-caption text-muted-foreground">{t("pausedHelp")}</p>}
          {projection.isDue && <p role="status" className="text-caption text-muted-foreground">{t("finishing")}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5 [&_button]:text-caption [&_button]:px-2 [&_button]:h-9">
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

        {attention.awayCandidate && !terminal && (
          <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>{t("reviewDistraction")}</Button>
        )}
        {!online && <p role="alert" className="text-body text-destructive">{t("offline")}</p>}
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 p-3 text-body text-destructive">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{error}
          </div>
        )}

        <div className="hidden grid-cols-3 gap-2 lg:grid">
          <Metric label={t("completedRounds")} value={`${stats.completedRounds}/${stats.roundCount}`} />
          <Metric label={t("focusTime")} value={formatFocusV2Clock(terminal ? snapshot.session.actual_focus_minutes * 60 : stats.displayedFocusSeconds)} />
          <Metric label={t("breakTime")} value={formatFocusV2Clock(stats.displayedBreakSeconds)} />
        </div>

        <div className="min-h-0 space-y-2 lg:flex lg:flex-1 lg:flex-col">
          <h3 className="text-label font-semibold">{t("timeline")}</h3>
          <ol ref={timelineRef} className="relative flex gap-2 overflow-x-auto pb-1 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:pr-1" aria-label={t("timeline")}>
            {snapshot.segments.map((segment) => {
              const isCurrent = segment.id === live?.id || (waiting && segment.id === upcoming?.id);
              return (
                <li key={segment.id} aria-current={isCurrent ? "step" : undefined}
                  className={cn("min-w-44 shrink-0 rounded-lg border border-border p-2 lg:min-w-0", isCurrent && "border-primary bg-primary/5")}>
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-caption font-medium">{t("round", { number: segment.round_number })} · {t(`kinds.${kindKey(segment.segment_kind)}`)}</span>
                    <Badge variant="secondary">{t(`statuses.${segmentStatusKey(segment.status)}`)}</Badge>
                  </div>
                  <p className="mt-1 text-caption text-muted-foreground">{t("plannedDuration", { minutes: Math.floor(segment.planned_seconds / 60) })}</p>
                </li>
              );
            })}
          </ol>
        </div>
        </aside>
        <div ref={chatRef} className="min-h-0 min-w-0 overflow-hidden p-3 lg:p-4" aria-label={t("studyChat")}>
          {children}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 p-2">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p suppressHydrationWarning className="mt-1 text-caption font-semibold tabular-nums">{value}</p>
    </div>
  );
}
