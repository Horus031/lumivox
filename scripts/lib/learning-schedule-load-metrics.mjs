import { performance } from "node:perf_hooks";

export async function pool(items, concurrency, work) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await work(items[index], index);
    }
  }));
  return results;
}

export async function measure(items, concurrency, work) {
  const started = performance.now();
  const samples = await pool(items, concurrency, async (item, index) => {
    const start = performance.now();
    try {
      const fields = await work(item, index);
      return { elapsed: performance.now() - start, ...fields };
    } catch (error) {
      return { elapsed: performance.now() - start, failed: true,
        code: error.code ?? error.name, reason: String(error.message).slice(0, 120) };
    }
  });
  return { ...summarize(samples, performance.now() - started), samples };
}

export function summarize(samples, elapsed) {
  const sorted = samples.map(s => s.elapsed).sort((a, b) => a - b);
  const quantile = p => sorted.length ? rounded(sorted[Math.ceil(p * sorted.length) - 1]) : null;
  const outcomes = {};
  for (const sample of samples) {
    const code = String(sample.code ?? "ok");
    outcomes[code] = (outcomes[code] ?? 0) + 1;
  }
  return {
    sampleCount: samples.length, p50Ms: quantile(.5), p95Ms: quantile(.95), p99Ms: quantile(.99),
    elapsedMs: rounded(elapsed), requestsPerSecond: rounded(samples.length / (elapsed / 1000)),
    errorCount: samples.filter(s => s.failed).length, outcomes,
  };
}

export const rounded = value => Math.round(value * 100) / 100;
