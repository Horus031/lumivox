import type { RecoveryAction } from "./task-risk-recovery.schemas";

export type RecoveryHistoryItem = {
  id: string;
  action: RecoveryAction;
  status: "initiated" | "applied" | "abandoned";
  originalDueAt: string;
  initiatedAt: string;
  appliedAt: string | null;
  evaluated: boolean;
  comparison: { before: number; after: number; delta: number } | null;
};
