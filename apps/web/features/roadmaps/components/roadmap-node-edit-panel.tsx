"use client";

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
  if (!selectedNode) {
    return (
      <aside className="rounded-2xl border bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Node Editor
        </p>

        <h2 className="mt-2 text-xl font-bold text-neutral-950 dark:text-neutral-50">
          Select a node
        </h2>

        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Click a roadmap node to edit its title, description, estimated hours,
          priority, and suggested dates.
        </p>
      </aside>
    );
  }

  const data = selectedNode.data;

  return (
    <aside className="rounded-2xl border bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Node Editor
          </p>

          <h2 className="mt-2 text-xl font-bold text-neutral-950 dark:text-neutral-50">
            Edit {data.nodeType}
          </h2>
        </div>

        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
          {data.nodeType}
        </span>
      </div>

      <div className="mt-5 space-y-4">
        <label className="space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Title
          </span>

          <input
            value={data.title}
            onChange={(event) =>
              onChangeNode(selectedNode.id, {
                title: event.target.value,
              })
            }
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Description
          </span>

          <textarea
            value={data.description ?? ""}
            rows={5}
            onChange={(event) =>
              onChangeNode(selectedNode.id, {
                description: event.target.value,
              })
            }
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Estimated hours
            </span>

            <input
              type="number"
              min={0.25}
              step={0.25}
              value={data.estimatedHours}
              onChange={(event) =>
                onChangeNode(selectedNode.id, {
                  estimatedHours: Number(event.target.value),
                })
              }
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Priority
            </span>

            <select
              value={data.priority}
              onChange={(event) =>
                onChangeNode(selectedNode.id, {
                  priority: Number(event.target.value),
                })
              }
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
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
          <label className="space-y-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Start date
            </span>

            <input
              type="date"
              value={data.suggestedStartDate ?? ""}
              onChange={(event) =>
                onChangeNode(selectedNode.id, {
                  suggestedStartDate: event.target.value || null,
                })
              }
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              End date
            </span>

            <input
              type="date"
              value={data.suggestedEndDate ?? ""}
              onChange={(event) =>
                onChangeNode(selectedNode.id, {
                  suggestedEndDate: event.target.value || null,
                })
              }
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => onDeleteNode(selectedNode.id)}
          className="w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
        >
          Delete node
        </button>
      </div>
    </aside>
  );
}
