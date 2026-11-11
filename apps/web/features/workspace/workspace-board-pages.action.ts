"use server";

import { z } from "zod";
import { TASK_BOARD_LANES, type TaskStatus } from "@/features/tasks/task-status";
import { workspaceFiltersSchema, type WorkspaceFilters } from "./workspace-board-pages";
import { getWorkspaceBoardPages } from "./workspace-board-pages.queries";

const requestSchema = z.object({
  filters: workspaceFiltersSchema,
  referenceNow: z.iso.datetime(),
  lane: z.enum(TASK_BOARD_LANES),
  countsOnly: z.boolean().optional(),
  after: z.object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() }).optional(),
});

export async function loadWorkspaceLane(input: {
  filters: WorkspaceFilters;
  referenceNow: string;
  lane: TaskStatus;
  countsOnly?: boolean;
  after?: { createdAt: string; id: string };
}) {
  const parsed = requestSchema.parse(input);
  const { filters, referenceNow, lane, countsOnly, after } = parsed;
  const pages = await getWorkspaceBoardPages(filters, referenceNow, countsOnly ? [] : [lane], lane, after);
  return pages[lane];
}
