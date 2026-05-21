"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { FocusSessionWithTask } from "@/features/focus-sessions/focus-session.types";
import {
  cancelFocusSessionAction,
  completeFocusSessionAction,
  pauseFocusSessionAction,
  resumeFocusSessionAction,
} from "@/features/focus-sessions/focus-session.actions";
import { logDistractionAction } from "@/features/distractions/distraction.actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type ActiveFocusSessionPanelProps = {
  session: FocusSessionWithTask;
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
  const [isPending, startTransition] = useTransition();

  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    calculateRemainingSeconds(session),
  );

  const [distractionType, setDistractionType] = useState<
    "social_media" | "messaging" | "external_interrupt" | "fatigue" | "other"
  >("other");
  const [durationSeconds, setDurationSeconds] = useState("60");
  const [note, setNote] = useState("");

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
    const confirmed = window.confirm(
      "Cancel this focus session? It will still be stored as cancelled.",
    );

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

  function handleLogDistraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await logDistractionAction({
        sessionId: session.id,
        distractionType,
        durationSeconds: Number(durationSeconds),
        note,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setDistractionType("other");
      setDurationSeconds("60");
      setNote("");
      router.refresh();
    });
  }

  return (
    <section className="space-y-6">
      <article className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
              Active focus session
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              {session.tasks?.title ?? "General focus session"}
            </h2>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium capitalize">
                {session.status}
              </span>

              <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium">
                Planned: {session.planned_minutes} min
              </span>
            </div>
          </div>

          <div className="text-left md:text-right">
            <p className="text-sm text-neutral-500">Remaining time</p>

            <p
              className={`mt-1 text-5xl font-bold tracking-tight ${
                remainingSeconds <= 0 ? "text-emerald-600" : "text-neutral-900"
              }`}
            >
              {timerText}
            </p>

            {remainingSeconds <= 0 && (
              <p className="mt-2 text-sm font-medium text-emerald-700">
                Planned duration reached. You may complete the session.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {session.status === "ongoing" ? (
            <Button
              variant={"outline"}
              onClick={handlePause}
              disabled={isPending}
            >
              Pause
            </Button>
          ) : (
            <Button
              variant={"outline"}
              onClick={handleResume}
              disabled={isPending}
            >
              Resume
            </Button>
          )}

          <Button
            onClick={handleComplete}
            disabled={isPending || session.status !== "ongoing"}
          >
            Complete session
          </Button>

          <Button
            variant={"outline"}
            onClick={handleCancel}
            disabled={isPending}
            className="border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel session
          </Button>
        </div>
      </article>

      <article className="rounded-2xl border bg-white p-6 shadow-sm">
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
              {/* <select
                value={distractionType}
                onChange={(event) =>
                  setDistractionType(
                    event.target.value as
                      | "social_media"
                      | "messaging"
                      | "external_interrupt"
                      | "fatigue"
                      | "other",
                  )
                }
                className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
              >
                <option value="social_media">Social media</option>
                <option value="messaging">Messaging</option>
                <option value="external_interrupt">External interrupt</option>
                <option value="fatigue">Fatigue</option>
                <option value="other">Other</option>
              </select> */}
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
            variant={'outline'}
            type="submit"
            disabled={isPending}
            className="border px-4 py-2.5 text-sm font-medium transition hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Logging..." : "Log distraction"}
          </Button>
        </form>
      </article>
    </section>
  );
}
