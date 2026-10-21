"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadFocusV2SnapshotAction, transitionFocusV2Action } from "./focus-v2.actions";
import { projectFocusV2Timer, shouldAutoCompleteFocusV2 } from "./focus-v2.timer";
import type { FocusV2Action, FocusV2Snapshot } from "./focus-v2.types";

// Phase 3: independent timer/controller. Phase 5 mounts this in the Pomodoro UI.
// No service-role credentials or timers persisted in browser storage.
export function useFocusV2Timer(initialSnapshot: FocusV2Snapshot) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  // Server clock estimate prevents large local wall-clock skew affecting display.
  const clockOffsetRef = useRef(Date.parse(initialSnapshot.serverObservedAt) - Date.now());
  const busyRef = useRef(false);
  const autoRetryAfterRef = useRef(0);
  const revisionRef = useRef(0);
  const sessionId = initialSnapshot.session.id;

  const refresh = useCallback(async () => {
    const revision = ++revisionRef.current;
    try {
      const result = await loadFocusV2SnapshotAction(sessionId);
      if (revision !== revisionRef.current) return;
      if (result.success) {
        clockOffsetRef.current = Date.parse(result.data.serverObservedAt) - Date.now();
        setSnapshot(result.data);
        setError(null);
      } else {
        setError(result.message);
      }
    } catch {
      if (revision === revisionRef.current) setError("Unable to synchronize Focus V2 session.");
    } finally {
      if (revision === revisionRef.current) setNow(Date.now() + clockOffsetRef.current);
    }
  }, [sessionId]);

  const apply = useCallback(async (
    action: FocusV2Action,
    expectedSegmentId: string | null,
  ): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setIsPending(true);
    try {
      const result = await transitionFocusV2Action({ sessionId, action, expectedSegmentId });
      if (!result.success) {
        setError(result.message);
        return false;
      }
      setError(null);
      return true;
    } catch {
      setError("Unable to change Focus V2 session.");
      return false;
    } finally {
      busyRef.current = false;
      setIsPending(false);
      await refresh();
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(`lumivox-focus-v2-${sessionId}`);
        channel.postMessage({ type: "refresh" });
        channel.close();
      }
    }
  }, [refresh, sessionId]);

  useEffect(() => {
    if (!visible) return;
    const interval = window.setInterval(() => setNow(Date.now() + clockOffsetRef.current), 1000);
    return () => window.clearInterval(interval);
  }, [visible]);

  useEffect(() => {
    function synchronize() {
      setVisible(!document.hidden);
      setOnline(navigator.onLine);
      if (!document.hidden && navigator.onLine) void refresh();
    }
    const onOnline = () => { setOnline(true); void refresh(); };
    const onOffline = () => setOnline(false);
    document.addEventListener("visibilitychange", synchronize);
    window.addEventListener("focus", synchronize);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`lumivox-focus-v2-${sessionId}`) : null;
    if (channel) channel.onmessage = () => { if (!document.hidden) void refresh(); };
    synchronize();
    return () => {
      document.removeEventListener("visibilitychange", synchronize);
      window.removeEventListener("focus", synchronize);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      channel?.close();
    };
  }, [refresh, sessionId]);

  // Reconcile missed tab broadcasts without making per-second database requests.
  useEffect(() => {
    if (!visible || !online || ["completed", "cancelled"].includes(snapshot.session.status)) return;
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    return () => window.clearInterval(interval);
  }, [visible, online, snapshot.session.status, refresh]);

  useEffect(() => {
    clockOffsetRef.current = Date.parse(initialSnapshot.serverObservedAt) - Date.now();
    setSnapshot(initialSnapshot);
    setNow(Date.now() + clockOffsetRef.current);
    autoRetryAfterRef.current = 0;
  }, [initialSnapshot]);

  const projection = useMemo(() => projectFocusV2Timer(snapshot, now), [snapshot, now]);

  useEffect(() => {
    if (!shouldAutoCompleteFocusV2(projection, visible, online)) return;
    if (busyRef.current || Date.now() < autoRetryAfterRef.current) return;
    const segmentId = projection.current?.id;
    if (!segmentId) return;
    autoRetryAfterRef.current = Date.now() + 15_000;
    void apply("complete", segmentId);
  }, [projection, visible, online, apply]);

  return {
    snapshot, projection, error, isPending, online, visible,
    refresh,
    transition: (action: FocusV2Action, expectedSegmentId: string | null) =>
      apply(action, expectedSegmentId),
  };
}
