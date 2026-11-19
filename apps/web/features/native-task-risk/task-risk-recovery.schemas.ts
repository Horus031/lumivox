import { z } from "zod";

export const recoveryActionSchema = z.enum(["start_focus", "split_task", "reschedule", "reduce_scope"]);
export type RecoveryAction = z.infer<typeof recoveryActionSchema>;

export const recoveryStartSchema = z.object({
  taskId: z.uuid(),
  predictionId: z.uuid(),
  actionType: recoveryActionSchema,
  idempotencyKey: z.uuid(),
}).strict();
