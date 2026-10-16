"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

import type {
  RoadmapFlowNode,
  RoadmapFlowNodeData,
} from "@/features/roadmaps/components/roadmap-flow-node";

type RoadmapNodeEditPanelProps = {
  selectedNode: RoadmapFlowNode | null;
  onChangeNode: (
    nodeId: string,
    data: Partial<RoadmapFlowNodeData>
  ) => void;
  onDeleteNode: (nodeId: string) => void;
};

export function RoadmapNodeEditPanel({
  selectedNode,
  onChangeNode,
  onDeleteNode,
}: RoadmapNodeEditPanelProps) {
  const t = useTranslations("roadmaps");
  if (!selectedNode) {
    return (
      <aside className="min-w-0 border-t border-border pt-card xl:border-t-0 xl:border-l xl:pl-card xl:pt-0">
        <p className="text-caption text-muted-foreground">
          {t("nodeEditor")}
        </p>

        <h2 className="mt-2 text-section font-semibold text-foreground">
          {t("noSelection")}
        </h2>

      </aside>
    );
  }

  const data = selectedNode.data;

  return (
    <aside className="min-w-0 border-t border-border pt-card xl:border-t-0 xl:border-l xl:pl-card xl:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption text-muted-foreground">
            {t("nodeEditor")}
          </p>

          <h2 className="mt-2 text-section font-semibold text-foreground">
            {t("editNode", { type: t(`types.${data.nodeType}`) })}
          </h2>
        </div>

        <span className="rounded-sm bg-muted px-2 py-0.5 text-caption text-foreground">
          {t(`types.${data.nodeType}`)}
        </span>
      </div>

      <div className="mt-5 space-y-4">
        <label className="block min-w-0 space-y-1.5">
          <span className="text-label font-medium text-foreground">
            {t("fields.title")}
          </span>

          <Input
            value={data.title}
            onChange={(event) =>
              onChangeNode(selectedNode.id, {
                title: event.target.value,
              })
            }
            className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
          />
        </label>

        <label className="block min-w-0 space-y-1.5">
          <span className="text-label font-medium text-foreground">
            {t("fields.description")}
          </span>

          <Textarea
            value={data.description ?? ""}
            rows={3}
            onChange={(event) =>
              onChangeNode(selectedNode.id, {
                description: event.target.value,
              })
            }
            className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block min-w-0 space-y-1.5">
            <span className="text-label font-medium text-foreground">
              {t("fields.hours")}
            </span>

            <Input
              type="number"
              min={0.25}
              step={0.25}
              value={data.estimatedHours}
              onChange={(event) =>
                onChangeNode(selectedNode.id, {
                  estimatedHours: Number(event.target.value),
                })
              }
              className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
            />
          </label>

          <label className="block min-w-0 space-y-1.5">
            <span className="text-label font-medium text-foreground">
              {t("fields.priority")}
            </span>

            <select
              value={data.priority}
              onChange={(event) =>
                onChangeNode(selectedNode.id, {
                  priority: Number(event.target.value),
                })
              }
              className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
            >
              {[1, 2, 3, 4, 5].map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block min-w-0 space-y-1.5">
            <span className="text-label font-medium text-foreground">
              {t("fields.startDate")}
            </span>

            <Input
              type="date"
              value={data.suggestedStartDate ?? ""}
              onChange={(event) =>
                onChangeNode(selectedNode.id, {
                  suggestedStartDate: event.target.value || null,
                })
              }
              className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
            />
          </label>

          <label className="block min-w-0 space-y-1.5">
            <span className="text-label font-medium text-foreground">
              {t("fields.endDate")}
            </span>

            <Input
              type="date"
              value={data.suggestedEndDate ?? ""}
              onChange={(event) =>
                onChangeNode(selectedNode.id, {
                  suggestedEndDate: event.target.value || null,
                })
              }
              className="h-touch w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-control md:text-body"
            />
          </label>
        </div>

        <Button
          type="button"
          onClick={() => onDeleteNode(selectedNode.id)}
          variant="outline"
          className="hover:bg-danger/10"
        >
          <Trash2 aria-hidden="true" />{t("deleteNode")}
        </Button>
      </div>
    </aside>
  );
}
