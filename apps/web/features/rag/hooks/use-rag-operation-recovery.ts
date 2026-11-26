"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { reconcileRagOperationAction, type RagConversationRestoreResponse } from "../rag-chat.actions";
import {
  clearRecoveryReference, readRecoveryReference, writeRecoveryReference, type RagRecoveryReference,
} from "../lib/rag-recovery-journal";

type RecoveryState = "idle" | "checking" | "processing" | "unknown" | "failed" | "access_unavailable" | "unavailable";
type TerminalStatus = "completed" | "failed" | "access_unavailable";
type Options = {
  accountScope?: string;
  epoch: RefObject<number>;
  restore: (focusId: string, expectedEpoch: number) => Promise<RagConversationRestoreResponse | null>;
  onTerminal: (reference: RagRecoveryReference, status: TerminalStatus) => void;
};

const POLL_WINDOW_MS = 60_000;

function pendingReference(focusId: string, data: RagConversationRestoreResponse): RagRecoveryReference | null {
  if (!data.pending_operation || !data.recovery_enabled) return null;
  return {
    version: 1, protocol: "rag-v2", operation: "ask",
    clientRequestId: data.pending_operation.client_request_id,
    focusSessionId: focusId, sessionId: data.session_id, createdAt: Date.now(),
  };
}

export function useRagOperationRecovery({ accountScope, epoch, restore, onTerminal }: Options) {
  const [state, setState] = useState<RecoveryState>("idle");
  const [reference, setReference] = useState<RagRecoveryReference | null>(null);
  const [attempt, setAttempt] = useState(0);
  const current = useRef<RagRecoveryReference | null>(null);
  const inFlight = useRef<{ epoch: number } | null>(null);
  const pollStartedAt = useRef<number | null>(null);

  const track = useCallback((next: RagRecoveryReference) => {
    if (current.current?.clientRequestId === next.clientRequestId) return current.current;
    if (accountScope) writeRecoveryReference(accountScope, next);
    current.current = next;
    pollStartedAt.current = null;
    setReference(next);
    setAttempt(0);
    setState("idle");
    return next;
  }, [accountScope]);

  const reset = useCallback(() => {
    current.current = null;
    pollStartedAt.current = null;
    setReference(null);
    setState("idle");
    setAttempt(0);
  }, []);

  const clear = useCallback((finished: RagRecoveryReference) => {
    if (accountScope) clearRecoveryReference(accountScope, finished.focusSessionId, finished.clientRequestId);
    if (current.current?.clientRequestId === finished.clientRequestId) reset();
  }, [accountScope, reset]);

  const check = useCallback(async (target: RagRecoveryReference) => {
    if (current.current?.clientRequestId !== target.clientRequestId || inFlight.current?.epoch === epoch.current) return;
    const call = { epoch: epoch.current };
    inFlight.current = call;
    const isCurrent = () => epoch.current === call.epoch && current.current?.clientRequestId === target.clientRequestId;
    setState("checking");
    const args = { focusSessionId: target.focusSessionId, clientRequestId: target.clientRequestId, operation: target.operation };
    try {
      let result = await reconcileRagOperationAction(args);
      if (!isCurrent()) return;
      if (result.success && result.data.status === "expired" && target.operation === "ask") {
        result = await reconcileRagOperationAction({ ...args, recoverExpired: true });
      }
      if (!isCurrent()) return;
      if (!result.success || result.data.operation !== target.operation) {
        setState("unavailable");
        return;
      }
      const { status } = result.data;
      if (status === "processing") {
        if (pollStartedAt.current === null) pollStartedAt.current = Date.now();
        setAttempt((value) => value + 1);
        setState("processing");
        return;
      }
      if (status === "unknown" || status === "expired") {
        setState("unknown");
        return;
      }

      const data = await restore(target.focusSessionId, call.epoch);
      if (!data) {
        if (isCurrent()) setState("unavailable");
        return;
      }
      // Canonical restore applied the snapshot and advanced the epoch.
      if (current.current?.clientRequestId !== target.clientRequestId) return;
      clear(target);
      onTerminal(target, status);
      const next = pendingReference(target.focusSessionId, data);
      if (next && next.clientRequestId !== target.clientRequestId) {
        track(next);
        pollStartedAt.current = Date.now();
        setState("processing");
      } else {
        setState(status === "completed" ? "idle" : status);
      }
    } catch {
      if (isCurrent()) setState("unavailable");
    } finally {
      if (inFlight.current === call) inFlight.current = null;
    }
  }, [clear, epoch, onTerminal, restore, track]);

  const discover = useCallback((focusId: string, data: RagConversationRestoreResponse) => {
    if (!data.recovery_enabled) return;
    const saved = accountScope ? readRecoveryReference(accountScope, focusId) : null;
    const tracked = current.current?.focusSessionId === focusId ? current.current : null;
    const next = saved ?? tracked ?? pendingReference(focusId, data);
    if (next) void check(track(next));
  }, [accountScope, check, track]);

  useEffect(() => {
    if (state !== "processing" || !reference || pollStartedAt.current === null) return;
    const startedAt = pollStartedAt.current;
    const expectedEpoch = epoch.current;
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      const delay = Math.min(3_000 * (2 ** Math.min(Math.max(attempt - 1, 0), 2)), 10_000);
      if (document.visibilityState !== "visible" || Date.now() + delay > startedAt + POLL_WINDOW_MS) return;
      timer = window.setTimeout(() => {
        if (epoch.current === expectedEpoch && document.visibilityState === "visible"
          && Date.now() <= startedAt + POLL_WINDOW_MS) void check(reference);
      }, delay);
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [attempt, check, epoch, reference, state]);

  return { state, reference, track, clear, reset, check, discover, setState };
}
