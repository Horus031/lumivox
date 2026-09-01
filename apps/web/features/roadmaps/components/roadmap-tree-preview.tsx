import type { RoadmapTreeNode } from "@/features/roadmaps/roadmap.types";

type RoadmapTreePreviewProps = {
  tree: RoadmapTreeNode[];
};

function nodeBadgeClass(nodeType: string) {
  if (nodeType === "goal") {
    return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  }

  if (nodeType === "task") {
    return "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300";
  }

  return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
}

function RoadmapNodeCard({
  node,
  depth,
}: {
  node: RoadmapTreeNode;
  depth: number;
}) {
  return (
    <div className="relative">
      {depth > 0 ? (
        <div className="absolute -left-5 top-0 h-full border-l border-dashed border-neutral-300 dark:border-neutral-700" />
      ) : null}

      <div
        className="rounded-2xl border bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
        style={{
          marginLeft: depth * 24,
        }}
      >
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${nodeBadgeClass(
                  node.node_type
                )}`}
              >
                {node.node_type}
              </span>

              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                Priority {node.priority}
              </span>

              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                {node.estimated_hours}h
              </span>
            </div>

            <h3 className="mt-3 text-lg font-semibold text-neutral-950 dark:text-neutral-50">
              {node.title}
            </h3>

            {node.description ? (
              <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
                {node.description}
              </p>
            ) : null}
          </div>

          <div className="min-w-fit rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            {node.suggested_start_date ?? "No start"} →{" "}
            {node.suggested_end_date ?? "No end"}
          </div>
        </div>
      </div>

      {node.children.length > 0 ? (
        <div className="mt-3 space-y-3">
          {node.children.map((child) => (
            <RoadmapNodeCard key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RoadmapTreePreview({ tree }: RoadmapTreePreviewProps) {
  if (tree.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed p-10 text-center dark:border-neutral-800">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No roadmap nodes were generated.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {tree.map((node) => (
        <RoadmapNodeCard key={node.id} node={node} depth={0} />
      ))}
    </section>
  );
}