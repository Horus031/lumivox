type Stage = "auth" | "sessions" | "tasks" | "audits" | "related" | "projection" |
  "ownership" | "links" | "parents" | "confirmLinks" | "prepare";

/** Opt-in server timings. Call sites supply fixed stage names only. */
export function studyPlanTiming(scope: "plan" | "effort" | "renderPreparation") {
  const enabled = process.env.STUDY_PLAN_PERF_TIMING === "true";
  const started = performance.now();
  let previous = started;
  const stages: Partial<Record<Stage, number>> = {};
  return {
    async measure<T>(stage: Stage, work: () => Promise<T>) {
      if (!enabled) return work();
      const start = performance.now();
      try { return await work(); }
      finally { stages[stage] = Math.round((performance.now() - start) * 100) / 100; }
    },
    mark(stage: Stage) {
      if (!enabled) return;
      const now = performance.now();
      stages[stage] = Math.round((now - previous) * 100) / 100;
      previous = now;
    },
    finish() {
      if (enabled) console.info("study_plan_timing", JSON.stringify({
        scope, stages, elapsedMs: Math.round((performance.now() - started) * 100) / 100,
      }));
    },
  };
}
