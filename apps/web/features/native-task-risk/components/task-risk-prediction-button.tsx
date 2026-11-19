"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { predictTaskRiskAction, type TaskRiskPredictionResult } from "../task-risk-prediction.actions";

type PredictionSuccess = Extract<TaskRiskPredictionResult, { success: true }>;

export function TaskRiskPredictionButton({ taskId, stale, onPredicted }: {
  taskId: string;
  stale: boolean;
  onPredicted: (state: PredictionSuccess["state"]) => void;
}) {
  const t = useTranslations("taskRiskRecovery.prediction");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  function predict() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await predictTaskRiskAction(taskId);
        if (!active.current) return;
        if (result.success) onPredicted(result.state);
        else setError(result.error);
      } catch {
        if (active.current) setError("unavailable");
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <div className="space-y-2" aria-busy={pending}>
      <Button type="button" onClick={predict} disabled={pending}>
        {t(pending ? "pending" : stale ? "refresh" : "create")}
      </Button>
      {error && <p role="status" className="text-body text-destructive">{t(error)}</p>}
    </div>
  );
}
