import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import type {
  LearningRoadmap,
  LearningRoadmapListItem,
  LearningRoadmapNode,
  RoadmapTreeNode,
} from "@/features/roadmaps/roadmap.types";

export async function getMyRoadmaps() {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("learning_roadmaps")
    .select(
      [
        "id",
        "title",
        "topic",
        "subject_name",
        "description",
        "start_date",
        "end_date",
        "study_days_per_week",
        "minutes_per_study_day",
        "status",
      ].join(","),
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load roadmaps: ${error.message}`);
  }

  return (data ?? []) as unknown as LearningRoadmapListItem[];
}

export async function getMyRoadmapDetail(roadmapId: string) {
  const { supabase, user } = await requireUser();

  const [roadmapResult, nodesResult] = await Promise.all([
    supabase
      .from("learning_roadmaps")
      .select("*")
      .eq("id", roadmapId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("learning_roadmap_nodes")
      .select("*")
      .eq("roadmap_id", roadmapId)
      .eq("user_id", user.id)
      .order("position_y", { ascending: true })
      .order("position_x", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

  if (roadmapResult.error) {
    throw new Error(
      `Failed to load roadmap: ${roadmapResult.error.message}`,
    );
  }

  if (!roadmapResult.data) {
    notFound();
  }

  if (nodesResult.error) {
    throw new Error(
      `Failed to load roadmap nodes: ${nodesResult.error.message}`,
    );
  }

  const roadmap = roadmapResult.data;
  const nodes = nodesResult.data;

  return {
    roadmap: roadmap as LearningRoadmap,
    nodes: (nodes ?? []) as LearningRoadmapNode[],
    tree: buildRoadmapTree((nodes ?? []) as LearningRoadmapNode[]),
  };
}

export function buildRoadmapTree(nodes: LearningRoadmapNode[]): RoadmapTreeNode[] {
  const nodeMap = new Map<string, RoadmapTreeNode>();

  for (const node of nodes) {
    nodeMap.set(node.id, {
      ...node,
      children: [],
    });
  }

  const roots: RoadmapTreeNode[] = [];

  for (const node of nodeMap.values()) {
    if (!node.parent_node_id) {
      roots.push(node);
      continue;
    }

    const parent = nodeMap.get(node.parent_node_id);

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortTree = (items: RoadmapTreeNode[]) => {
    items.sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }

      return a.title.localeCompare(b.title);
    });

    for (const item of items) {
      sortTree(item.children);
    }
  };

  sortTree(roots);

  return roots;
}