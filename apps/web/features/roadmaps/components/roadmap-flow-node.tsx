"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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


const NODE_TONES = { goal: "border-primary/40", task: "border-info/40", subtask: "border-warning/40" };

export function RoadmapFlowNode({ id, data, selected }: NodeProps<RoadmapFlowNode>) {
  const t = useTranslations("roadmaps");
  const canHaveParent = data.nodeType !== "goal";
  const canHaveChild = data.nodeType !== "subtask";
  return (
    <div onClick={() => data.onSelectNode?.(id)}
      className={cn("w-60 rounded-lg border bg-card p-3 text-foreground", NODE_TONES[data.nodeType], selected && "ring-2 ring-ring")}>
      {canHaveParent ? <Handle type="target" position={Position.Top} className="border-card! bg-foreground!" /> : null}
      <div className="flex items-start justify-between gap-2">
        <Badge variant="secondary">{t(`types.${data.nodeType}`)}</Badge>
        <span className="shrink-0 text-caption text-muted-foreground">P{data.priority} · {t("hours", { value: data.estimatedHours })}</span>
      </div>
      <h3 title={data.title} className="mt-2 text-body font-medium line-clamp-2 [overflow-wrap:anywhere]">{data.title}</h3>
      {data.description ? <p className="mt-1 text-caption text-secondary-text line-clamp-2 [overflow-wrap:anywhere]">{data.description}</p> : null}
      <p className="mt-2 text-caption text-muted-foreground [overflow-wrap:anywhere]">{data.suggestedStartDate ?? t("noStart")} - {data.suggestedEndDate ?? t("noEnd")}</p>
      {canHaveChild ? <>
        <Button type="button" size="sm" variant="ghost" className="nodrag mt-2 w-full justify-start"
          onClick={(event) => { event.stopPropagation(); data.onAddChild?.(id); }}>
          <Plus aria-hidden="true" />{t("addChild", { type: t(`types.${data.nodeType === "goal" ? "task" : "subtask"}`) })}
        </Button>
        <Handle type="source" position={Position.Bottom} className="border-card! bg-foreground!" />
      </> : null}
    </div>
  );
}
