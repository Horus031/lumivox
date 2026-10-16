import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { RoadmapTreeNode } from "@/features/roadmaps/roadmap.types";

function RoadmapNodeCard({ node, depth }: { node: RoadmapTreeNode; depth: number }) {
  const t = useTranslations("roadmaps");
  return <div className="min-w-0">
    <article className="min-w-0 border-b border-border py-3" style={{ marginLeft: Math.min(depth, 2) * 12 }}>
      <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
        <Badge variant="secondary">{t(`types.${node.node_type}`)}</Badge>
        <span>{t("priority", { value: node.priority })}</span>
        <span>{t("hours", { value: node.estimated_hours })}</span>
        {(node.linked_goal_id || node.linked_task_id) ? <Badge variant="outline">{t("statuses.applied")}</Badge> : null}
      </div>
      <h3 className="mt-2 text-body font-medium [overflow-wrap:anywhere]">{node.title}</h3>
      {node.description ? <p className="mt-1 text-body text-secondary-text [overflow-wrap:anywhere]">{node.description}</p> : null}
      <p className="mt-2 text-caption text-muted-foreground [overflow-wrap:anywhere]">{node.suggested_start_date ?? t("noStart")} - {node.suggested_end_date ?? t("noEnd")}</p>
    </article>
    {node.children.map((child) => <RoadmapNodeCard key={child.id} node={child} depth={depth + 1} />)}
  </div>;
}

export function RoadmapTreePreview({ tree }: { tree: RoadmapTreeNode[] }) {
  const t = useTranslations("roadmaps");
  if (!tree.length) return <p className="py-card text-body text-muted-foreground">{t("treeEmpty")}</p>;
  return <div className="min-w-0">{tree.map((node) => <RoadmapNodeCard key={node.id} node={node} depth={0} />)}</div>;
}
