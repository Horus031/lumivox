"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { FocusSessionWithTask } from "@/features/focus-sessions/focus-session.types";
import {
  cancelFocusSessionAction,
  completeFocusSessionAction,
  pauseFocusSessionAction,
  resumeFocusSessionAction,
} from "@/features/focus-sessions/focus-session.actions";
// import { logDistractionAction } from "@/features/distractions/distraction.actions";
import { Button } from "@/components/ui/button";
// import { Label } from "@/components/ui/label";
// import {
//   Select,
//   SelectContent,
//   SelectGroup,
//   SelectItem,
//   SelectLabel,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { Input } from "@/components/ui/input";
import { Task } from "@/features/tasks/task.types";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Timer,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type ActiveFocusSessionPanelProps = {
  session: FocusSessionWithTask;
  task: Task | null;
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

function calculateRemainingSeconds(session: FocusSessionWithTask) {
  const plannedSeconds = session.planned_minutes * 60;
  const nowMs = Date.now();
  const startedMs = new Date(session.started_at).getTime();

  const rawElapsedSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1000));

  let pausedSeconds = session.total_paused_seconds;

  if (session.status === "paused" && session.paused_at) {
    const currentPauseSeconds = Math.max(
      0,
      Math.floor((nowMs - new Date(session.paused_at).getTime()) / 1000),
    );

    pausedSeconds += currentPauseSeconds;
  }

  const activeElapsedSeconds = Math.max(0, rawElapsedSeconds - pausedSeconds);

  return plannedSeconds - activeElapsedSeconds;
}

export function ActiveFocusSessionPanel({
  session,
}: ActiveFocusSessionPanelProps) {
  const router = useRouter();
  const t = useTranslations("focus.active");
  const [isPending, startTransition] = useTransition();
  const [isCollapsed, setIsCollapsed] = useState(true);

  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    calculateRemainingSeconds(session),
  );

  // const [distractionType, setDistractionType] = useState<
  //   "social_media" | "messaging" | "external_interrupt" | "fatigue" | "other"
  // >("other");
  // const [durationSeconds, setDurationSeconds] = useState("60");
  // const [note, setNote] = useState("");

  useEffect(() => {
    setRemainingSeconds(calculateRemainingSeconds(session));

    if (session.status === "paused") return;

    const interval = window.setInterval(() => {
      setRemainingSeconds(calculateRemainingSeconds(session));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [session]);

  const timerText = useMemo(
    () => formatClock(remainingSeconds),
    [remainingSeconds],
  );
  const isOngoing = session.status === "ongoing";

  function handlePause() {
    startTransition(async () => {
      const result = await pauseFocusSessionAction(session.id);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  function handleResume() {
    startTransition(async () => {
      const result = await resumeFocusSessionAction(session.id);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  function handleComplete() {
    startTransition(async () => {
      const result = await completeFocusSessionAction(session.id);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  function handleCancel() {
    const confirmed = window.confirm(t("cancelConfirm"));

    if (!confirmed) return;

    startTransition(async () => {
      const result = await cancelFocusSessionAction(session.id);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  // function handleLogDistraction(event: FormEvent<HTMLFormElement>) {
  //   event.preventDefault();

  //   startTransition(async () => {
  //     const result = await logDistractionAction({
  //       sessionId: session.id,
  //       distractionType,
  //       durationSeconds: Number(durationSeconds),
  //       note,
  //     });

  //     if (!result.success) {
  //       toast.error(result.message);
  //       return;
  //     }

  //     toast.success(result.message);
  //     setDistractionType("other");
  //     setDurationSeconds("60");
  //     setNote("");
  //     router.refresh();
  //   });
  // }

  const actionButtons = (
    <div className="flex shrink-0 items-center gap-1 rounded-full border bg-background/80 p-1 shadow-sm">
      {isOngoing ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("actions.pause")}
          title={t("actions.pause")}
          onClick={handlePause}
          disabled={isPending}
          className="size-8 rounded-full"
        >
          <Pause />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("actions.resume")}
          title={t("actions.resume")}
          onClick={handleResume}
          disabled={isPending}
          className="size-8 rounded-full"
        >
          <Play />
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("actions.complete")}
        title={t("actions.complete")}
        onClick={handleComplete}
        disabled={isPending || !isOngoing}
        className="size-8 rounded-full text-success hover:bg-success/10 hover:text-success"
      >
        <Check />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("actions.cancel")}
        title={t("actions.cancel")}
        onClick={handleCancel}
        disabled={isPending}
        className="size-8 rounded-full text-danger/70 hover:bg-danger/10 hover:text-danger"
      >
        <X />
      </Button>
    </div>
  );

  return (
    <section className="space-y-6">
      <article
        className={cn(
          "overflow-hidden rounded-2xl border bg-background shadow-sm transition-all duration-300",
          isCollapsed ? "p-3" : "p-6",
        )}
      >
        {isCollapsed ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-muted/40">
                <Timer className="size-4 text-muted-foreground" />
              </div>

              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-foreground">
                    {session.tasks?.title ?? t("generalSession")}
                  </h2>
                  <Badge className="shrink-0 capitalize">
                    {t(`status.${session.status}`)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("compactProgress", {
                    remaining: timerText,
                    minutes: session.planned_minutes,
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 md:justify-end">
              {actionButtons}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("actions.expand")}
                aria-expanded={!isCollapsed}
                title={t("actions.expand")}
                onClick={() => setIsCollapsed(false)}
                className="size-9 rounded-full"
              >
                <ChevronDown />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {t("eyebrow")}
                </p>

                <h2 className="mt-2 truncate text-xl font-bold text-foreground">
                  {session.tasks?.title ?? t("generalSession")}
                </h2>

                <div className="mt-3 flex flex-wrap gap-2 text-primary-foreground">
                  <Badge className="capitalize">
                    {t(`status.${session.status}`)}
                  </Badge>
                  <Badge>
                    {t("plannedBadge", { minutes: session.planned_minutes })}
                  </Badge>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("actions.collapse")}
                aria-expanded={!isCollapsed}
                title={t("actions.collapse")}
                onClick={() => setIsCollapsed(true)}
                className="size-9 shrink-0 rounded-full"
              >
                <ChevronUp />
              </Button>
            </div>

            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div className="rounded-2xl border bg-muted/20 px-5 py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("remainingTime")}
                </p>

                <p
                  className={`mt-1 text-5xl font-bold tracking-tight ${
                    remainingSeconds <= 0 ? "text-success" : "text-foreground"
                  }`}
                >
                  {timerText}
                </p>

                {remainingSeconds <= 0 && (
                  <p className="mt-2 text-xs font-medium text-success">
                    {t("durationReached")}
                  </p>
                )}
              </div>

              {actionButtons}
            </div>
          </div>
        )}
      </article>

      {/* <article className="rounded-2xl border bg-background p-6 shadow-sm">
        <div className="mb-5">
          <h3 className="text-xl font-semibold">Log a distraction</h3>
          <p className="mt-1 text-sm text-neutral-600">
            Record interruptions during this session for future behavioural
            analytics.
          </p>
        </div>

        <form onSubmit={handleLogDistraction} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-3">
              <Label>Type</Label>

              <Select
                value={distractionType ?? ""}
                onValueChange={(value) =>
                  setDistractionType(
                    value as
                      | "social_media"
                      | "messaging"
                      | "external_interrupt"
                      | "fatigue"
                      | "other",
                  )
                }
              >
                <SelectTrigger className="flex w-full h-11! border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring">
                  <SelectValue placeholder="Distraction type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Distraction type</SelectLabel>
                    <SelectItem value="social_media">Social media</SelectItem>
                    <SelectItem value="messaging">Messaging</SelectItem>
                    <SelectItem value="external_interrupt">
                      External interrupt
                    </SelectItem>
                    <SelectItem value="fatigue">Fatigue</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Duration in seconds</Label>

              <Input
                type="number"
                min={0}
                value={durationSeconds}
                onChange={(event) => setDurationSeconds(event.target.value)}
                className="h-11"
              />
            </div>

            <div className="space-y-3">
              <Label>Optional note</Label>

              <Input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Notification, phone call..."
                className="h-11"
              />
            </div>
          </div>

          <Button
            variant={"outline"}
            type="submit"
            disabled={isPending}
            className="border px-4 py-2.5 text-sm font-medium transition hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Logging..." : "Log distraction"}
          </Button>
        </form>
      </article> */}
    </section>
  );
}
