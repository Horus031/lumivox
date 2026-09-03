"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { RoadmapNodeType } from "@/features/roadmaps/roadmap.types";

export type RoadmapFlowNodeData = Record<string, unknown> & {
  nodeType: RoadmapNodeType;
  title: string;
  description: string | null;
  estimatedHours: number;
  suggestedStartDate: string | null;
  suggestedEndDate: string | null;
  priority: number;
  parentNodeId: string | null;
  sortOrder: number;
  onSelectNode?: (nodeId: string) => void;
  onAddChild?: (nodeId: string) => void;
};

export type RoadmapFlowNode = Node<RoadmapFlowNodeData, "roadmapNode">;

function nodeColorClass(type: RoadmapNodeType) {
  if (type === "goal") {
    return "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-50";
  }

  if (type === "task") {
    return "border-purple-200 bg-purple-50 text-purple-950 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-50";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-50";
}

function badgeClass(type: RoadmapNodeType) {
  if (type === "goal") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200";
  }

  if (type === "task") {
    return "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200";
  }

  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200";
}

export function RoadmapFlowNode({
  id,
  data,
  selected,
}: NodeProps<RoadmapFlowNode>) {
  const canHaveParent = data.nodeType !== "goal";
  const canHaveChild = data.nodeType !== "subtask";

  return (
    <div
      onClick={() => data.onSelectNode?.(id)}
      className={`w-70 rounded-2xl border p-4 shadow-sm transition ${
        selected ? "ring-2 ring-neutral-900 dark:ring-white" : ""
      } ${nodeColorClass(data.nodeType)}`}
    >
      {canHaveParent ? (
        <Handle
          type="target"
          position={Position.Top}
          className="border-white! bg-neutral-900! dark:bg-white!"
        />
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(
            data.nodeType
          )}`}
        >
          {data.nodeType}
        </span>

        <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:bg-black/20 dark:text-neutral-200">
          P{data.priority} · {data.estimatedHours}h
        </span>
      </div>

      <h3 className="mt-3 line-clamp-2 text-base font-bold">{data.title}</h3>

      {data.description ? (
        <p className="mt-2 line-clamp-3 text-xs leading-5 opacity-80">
          {data.description}
        </p>
      ) : null}

      <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs text-neutral-600 dark:bg-black/20 dark:text-neutral-300">
        {data.suggestedStartDate ?? "No start"} →{" "}
        {data.suggestedEndDate ?? "No end"}
      </div>

      {canHaveChild ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            data.onAddChild?.(id);
          }}
          className="mt-3 w-full rounded-xl bg-white/80 px-3 py-2 text-xs font-semibold text-neutral-800 transition hover:bg-white dark:bg-black/30 dark:text-neutral-100 dark:hover:bg-black/50"
        >
          Add {data.nodeType === "goal" ? "task" : "subtask"}
        </button>
      ) : null}

      {canHaveChild ? (
        <Handle
          type="source"
          position={Position.Bottom}
          className="border-white! bg-neutral-900! dark:bg-white!"
        />
      ) : null}
    </div>
  );
}
