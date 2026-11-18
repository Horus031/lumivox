import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = [
  "-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1",
  "-f", fileURLToPath(new URL("./task-risk-recovery-health.sql", import.meta.url)),
];
const result = spawnSync(process.env.TASK_RISK_MONITOR_PSQL || "psql", args, {
  encoding: "utf8",
  env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
  timeout: 15_000,
  windowsHide: true,
});

try {
  if (result.status !== 0) throw new Error();
  const status = JSON.parse(result.stdout);
  if (!Array.isArray(status.alerts)) throw new Error();
  console.log(JSON.stringify(status));
  if (status.alerts.length) process.exitCode = 1;
} catch {
  console.error("Task Risk Recovery health probe failed. Check database access and the installed schema.");
  process.exitCode = 2;
}
