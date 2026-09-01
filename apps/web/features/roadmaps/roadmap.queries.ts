import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import type {
  LearningRoadmap,
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
        "user_id",
        "title",
        "topic",
        "subject_name",
        "description",
        "current_level",
        "target_level",
        "custom_current_level",
        "custom_target_level",
        "start_date",
        "end_date",
        "study_days_per_week",
        "available_weekdays",
        "minutes_per_study_day",
        "preferred_locale",
        "status",
        "ai_provider",
        "ai_model",
        "ai_latency_ms",
        "applied_at",
        "archived_at",
        "created_at",
        "updated_at",
      ].join(",")
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load roadmaps: ${error.message}`);
  }

  return (data ?? []) as unknown as LearningRoadmap[];
}

export async function getMyRoadmapDetail(roadmapId: string) {
  const { supabase, user } = await requireUser();

  const { data: roadmap, error: roadmapError } = await supabase
    .from("learning_roadmaps")
    .select("*")
    .eq("id", roadmapId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (roadmapError) {
    throw new Error(`Failed to load roadmap: ${roadmapError.message}`);
  }

  if (!roadmap) {
    notFound();
  }

  const { data: nodes, error: nodesError } = await supabase
    .from("learning_roadmap_nodes")
    .select("*")
    .eq("roadmap_id", roadmapId)
    .eq("user_id", user.id)
    .order("position_y", { ascending: true })
    .order("position_x", { ascending: true })
    .order("sort_order", { ascending: true });

  if (nodesError) {
    throw new Error(`Failed to load roadmap nodes: ${nodesError.message}`);
  }

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