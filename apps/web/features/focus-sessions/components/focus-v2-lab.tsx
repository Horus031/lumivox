"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createFocusV2SessionAction } from "../focus-v2.actions";
import { DEFAULT_FOCUS_V2_CONFIG } from "../focus-v2-config.schemas";
import { useFocusV2Timer } from "../use-focus-v2-timer";
import type { FocusV2Action, FocusV2Snapshot } from "../focus-v2.types";

export function FocusV2Lab({ initialSnapshot }: { initialSnapshot: FocusV2Snapshot | null }) {
  return (
    <section className="space-y-5 rounded-lg border border-border bg-card p-card">
      <h1 className="text-section font-semibold">Focus V2 · Staging QA Lab</h1>
      <p className="text-body text-muted-foreground">
        Engineering-only verification surface. Not the Phase 5 user interface.
      </p>
      {initialSnapshot ? <ActiveLab initialSnapshot={initialSnapshot} /> : <StartLab />}
    </section>
  );
}

function StartLab() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      // Real server RPC, 2 × 5-minute rounds and a 1-minute break.
      const result = await createFocusV2SessionAction({
        ...DEFAULT_FOCUS_V2_CONFIG,
        focusMinutes: 5,
        shortBreakMinutes: 1,
        roundCount: 2,
      });
      setMessage(result.message);
      if (result.success) router.refresh();
    } catch { setMessage("Unable to start session."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <button type="button" disabled={busy} onClick={() => void start()}
      className="rounded-md border border-border px-4 py-2 disabled:opacity-50">
      {busy ? "Starting…" : "Create 2 × 5-min Focus V2 test session"}
    </button>
    <p role="status" className="text-body">{message}</p>
  </div>;
}

function ActiveLab({ initialSnapshot }: { initialSnapshot: FocusV2Snapshot }) {
  const router = useRouter();
  const { snapshot, projection, error, refresh, transition, online, visible } = useFocusV2Timer(initialSnapshot);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const segmentId = projection.current?.id ?? projection.next?.id ?? null;
  async function invoke(action: FocusV2Action) {
    if (working) return;
    setWorking(true);
    try {
      const ok = await transition(action, action === "cancel" ? projection.current?.id ?? null : segmentId);
      setMessage(ok ? `${action}: saved` : `${action}: reload state and inspect message`);
      if (ok && action === "cancel") router.refresh();
    } finally { setWorking(false); }
  }
  const mm = String(Math.floor(projection.remainingSeconds / 60)).padStart(2, "0");
  const ss = String(projection.remainingSeconds % 60).padStart(2, "0");
  return <div className="space-y-3">
    <div className="text-body">Session {snapshot.session.id} · {projection.phase} · online={String(online)} · visible={String(visible)}</div>
    <div className="font-mono text-4xl tabular-nums" role="timer" aria-live="off" suppressHydrationWarning>{mm}:{ss}</div>
    <div className="text-body">Segment {projection.current?.position ?? "—"} / {snapshot.segments.length} · {projection.current?.segment_kind ?? "awaiting next"}</div>
    <div className="flex flex-wrap gap-2">
      {(["pause", "resume", "complete", "skip_break", "start_next", "cancel"] as const).map(action => {
        const canUse = action === "cancel" ? ["running", "paused", "awaiting_next"].includes(projection.phase)
          : action === "pause" ? projection.phase === "running"
          : action === "resume" ? projection.phase === "paused"
          : action === "start_next" ? projection.phase === "awaiting_next"
          : action === "skip_break" ? projection.phase === "running" && projection.current?.segment_kind !== "focus"
          : projection.isDue;
        return <button key={action} type="button" disabled={working || !canUse || (!segmentId && action !== "cancel")}
          className="rounded-md border border-border px-3 py-2 disabled:opacity-40"
          onClick={() => void invoke(action)}>{action}</button>;
      })}
      <button type="button" onClick={() => void refresh()} className="rounded-md border border-border px-3 py-2">Refresh</button>
    </div>
    <p role="status" className="text-body">{error ?? message}</p>
    <div className="text-caption text-muted-foreground">For completed sessions, the normal Phase 5 history UI is not yet implemented.</div>
  </div>;
}
