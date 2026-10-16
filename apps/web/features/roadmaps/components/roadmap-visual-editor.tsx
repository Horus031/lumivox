"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type IsValidConnection,
  type NodeChange,
  type NodeTypes,
  type OnConnect,
  type OnInit,
  type OnReconnect,
} from "@xyflow/react";
import { ArrowLeft, Save, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { toast } from "sonner";

import {
  deleteRoadmapNodeAction,
  saveRoadmapEditorStateAction,
} from "@/features/roadmaps/roadmap.actions";
import {
  RoadmapFlowNode,
  type RoadmapFlowNode as RoadmapFlowNodeType,
  type RoadmapFlowNodeData,
} from "@/features/roadmaps/components/roadmap-flow-node";
import { RoadmapNodeEditPanel } from "@/features/roadmaps/components/roadmap-node-edit-panel";
import type {
  LearningRoadmap,
  LearningRoadmapNode,
  RoadmapNodeType,
} from "@/features/roadmaps/roadmap.types";
import { useRouter } from "@/i18n/navigation";

type RoadmapVisualEditorProps = {
  roadmap: LearningRoadmap;
  initialNodes: LearningRoadmapNode[];
};

const nodeTypes = {
  roadmapNode: RoadmapFlowNode,
} satisfies NodeTypes;

const defaultEdgeOptions = {
  deletable: false,
} satisfies Partial<Edge>;

const NODE_WIDTH = 240;
const NODE_HEIGHT = 224;
const NODE_X_GAP = 96;
const NODE_Y_GAP = 240;

function isValidParentChild(
  parentType: RoadmapNodeType,
  childType: RoadmapNodeType,
) {
  return (
    (parentType === "goal" && childType === "task") ||
    (parentType === "task" && childType === "subtask")
  );
}

function toFlowNodes(nodes: LearningRoadmapNode[]): RoadmapFlowNodeType[] {
  return nodes.map((node) => ({
    id: node.id,
    type: "roadmapNode",
    position: {
      x: Number(node.position_x ?? 0),
      y: Number(node.position_y ?? 0),
    },
    data: {
      nodeType: node.node_type,
      title: node.title,
      description: node.description,
      estimatedHours: Number(node.estimated_hours),
      suggestedStartDate: node.suggested_start_date,
      suggestedEndDate: node.suggested_end_date,
      priority: node.priority,
      parentNodeId: node.parent_node_id,
      sortOrder: node.sort_order,
    },
  }));
}

function toFlowEdges(nodes: LearningRoadmapNode[]): Edge[] {
  return nodes
    .filter((node) => node.parent_node_id)
    .map((node) => ({
      id: `${node.parent_node_id}-${node.id}`,
      source: node.parent_node_id as string,
      target: node.id,
      type: "smoothstep",
      animated: false,
    }));
}

function computeSortOrders(
  nodes: RoadmapFlowNodeType[],
): RoadmapFlowNodeType[] {
  const childrenByParent = new Map<string | null, RoadmapFlowNodeType[]>();

  for (const node of nodes) {
    const parentNodeId = node.data.parentNodeId;
    const siblings = childrenByParent.get(parentNodeId) ?? [];
    siblings.push(node);
    childrenByParent.set(parentNodeId, siblings);
  }

  const sortOrderById = new Map<string, number>();

  for (const siblings of childrenByParent.values()) {
    siblings
      .sort((a, b) => {
        if (a.position.y !== b.position.y) {
          return a.position.y - b.position.y;
        }

        return a.position.x - b.position.x;
      })
      .forEach((node, index) => {
        sortOrderById.set(node.id, index);
      });
  }

  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      sortOrder: sortOrderById.get(node.id) ?? node.data.sortOrder,
    },
  }));
}

function compareRoadmapNodes(
  a: RoadmapFlowNodeType,
  b: RoadmapFlowNodeType,
) {
  if (a.data.sortOrder !== b.data.sortOrder) {
    return a.data.sortOrder - b.data.sortOrder;
  }

  if (a.position.y !== b.position.y) {
    return a.position.y - b.position.y;
  }

  if (a.position.x !== b.position.x) {
    return a.position.x - b.position.x;
  }

  return a.data.title.localeCompare(b.data.title);
}

function layoutRoadmapNodes(
  nodes: RoadmapFlowNodeType[],
): RoadmapFlowNodeType[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string | null, RoadmapFlowNodeType[]>();

  for (const node of nodes) {
    const parentNodeId =
      node.data.parentNodeId && nodeById.has(node.data.parentNodeId)
        ? node.data.parentNodeId
        : null;
    const siblings = childrenByParent.get(parentNodeId) ?? [];

    siblings.push(node);
    childrenByParent.set(parentNodeId, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort(compareRoadmapNodes);
  }

  const positionedNodes = new Map<string, RoadmapFlowNodeType>();
  let cursorX = 0;

  function placeSubtree(node: RoadmapFlowNodeType, depth: number): number {
    const children = childrenByParent.get(node.id) ?? [];
    const y = depth * NODE_Y_GAP;

    if (children.length === 0) {
      const x = cursorX;
      cursorX += NODE_WIDTH + NODE_X_GAP;

      positionedNodes.set(node.id, {
        ...node,
        position: { x, y },
      });

      return x;
    }

    const childXs: number[] = children.map((child) =>
      placeSubtree(child, depth + 1),
    );
    const x: number = (childXs[0] + childXs[childXs.length - 1]) / 2;

    positionedNodes.set(node.id, {
      ...node,
      position: { x, y },
    });

    return x;
  }

  const rootNodes = childrenByParent.get(null) ?? [];
  rootNodes.forEach((node) => placeSubtree(node, 0));

  return computeSortOrders(
    nodes.map((node) => positionedNodes.get(node.id) ?? node),
  );
}

function hasOverlappingNodes(nodes: RoadmapFlowNodeType[]) {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const overlapsHorizontally =
        Math.abs(a.position.x - b.position.x) < NODE_WIDTH;
      const overlapsVertically =
        Math.abs(a.position.y - b.position.y) < NODE_HEIGHT;

      if (overlapsHorizontally && overlapsVertically) {
        return true;
      }
    }
  }

  return false;
}

function prepareInitialFlowNodes(nodes: LearningRoadmapNode[]) {
  const flowNodes = toFlowNodes(nodes);

  if (hasOverlappingNodes(flowNodes)) {
    return layoutRoadmapNodes(flowNodes);
  }

  return flowNodes;
}

function makeEdgeId({ source, target }: Pick<Connection, "source" | "target">) {
  return `${source}-${target}`;
}

function makeEdge(source: string, target: string): Edge {
  return {
    id: makeEdgeId({ source, target }),
    source,
    target,
    type: "smoothstep",
  };
}

function makeNewChildNode({
  parent,
  nodeType,
  title,
}: {
  parent: RoadmapFlowNodeType;
  nodeType: RoadmapNodeType;
  title: string;
}): RoadmapFlowNodeType {
  const id = crypto.randomUUID();

  return {
    id,
    type: "roadmapNode",
    position: {
      x: parent.position.x,
      y: parent.position.y + NODE_Y_GAP,
    },
    data: {
      nodeType,
      parentNodeId: parent.id,
      title,
      description: "",
      estimatedHours: 1,
      suggestedStartDate: null,
      suggestedEndDate: null,
      priority: 3,
      sortOrder: 0,
    },
  };
}

export function RoadmapVisualEditor({
  roadmap,
  initialNodes,
}: RoadmapVisualEditorProps) {
  const t = useTranslations("roadmaps");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [fitViewAfterLayout, setFitViewAfterLayout] =
    useState<(() => void) | null>(null);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<RoadmapFlowNodeType>(
    prepareInitialFlowNodes(initialNodes),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toFlowEdges(initialNodes),
  );

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((node) => node.id === selectedNodeId) ?? null;
  }, [nodes, selectedNodeId]);

  const nodeById = useMemo(() => {
    return new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;

      const sourceNode = nodeById.get(connection.source);
      const targetNode = nodeById.get(connection.target);

      if (!sourceNode || !targetNode) return false;

      return isValidParentChild(
        sourceNode.data.nodeType,
        targetNode.data.nodeType,
      );
    },
    [nodeById],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<RoadmapFlowNodeType>[]) => {
      onNodesChangeBase(changes);
    },
    [onNodesChangeBase],
  );

  const onInit = useCallback<OnInit<RoadmapFlowNodeType, Edge>>(
    (instance) => {
      setFitViewAfterLayout(
        () => () =>
          window.requestAnimationFrame(() => {
            instance.fitView({ duration: 300, padding: 0.2 });
          }),
      );
    },
    [],
  );

  const handleAutoLayout = useCallback(() => {
    setNodes((currentNodes) => layoutRoadmapNodes(currentNodes));
    fitViewAfterLayout?.();
    toast.success("Roadmap layout updated.");
  }, [fitViewAfterLayout, setNodes]);

  const onConnect = useCallback<OnConnect>(
    (connection) => {
      if (!isValidConnection(connection)) {
        toast.error("Invalid connection. Use goal → task or task → subtask.");
        return;
      }

      const source = connection.source;
      const target = connection.target;

      if (!source || !target) return;

      setEdges((currentEdges) => [
        ...currentEdges.filter((edge) => edge.target !== target),
        makeEdge(source, target),
      ]);

      setNodes((currentNodes) =>
        layoutRoadmapNodes(
          currentNodes.map((node) =>
            node.id === target
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    parentNodeId: source,
                  },
                }
              : node,
          ),
        ),
      );

      toast.success("Connection updated.");
    },
    [isValidConnection, setEdges, setNodes],
  );

  const onReconnect = useCallback<OnReconnect>(
    (oldEdge, newConnection) => {
      if (!isValidConnection(newConnection)) {
        toast.error("Invalid reconnection.");
        return;
      }

      const source = newConnection.source;
      const target = newConnection.target;

      if (!source || !target) return;

      setEdges((currentEdges) =>
        reconnectEdge(
          oldEdge,
          {
            source,
            target,
            sourceHandle: newConnection.sourceHandle,
            targetHandle: newConnection.targetHandle,
          },
          currentEdges,
          {
            getEdgeId: makeEdgeId,
          },
        ),
      );

      setNodes((currentNodes) =>
        layoutRoadmapNodes(
          currentNodes.map((node) => {
            if (node.id !== target) return node;

            return {
              ...node,
              data: {
                ...node.data,
                parentNodeId: source,
              },
            };
          }),
        ),
      );

      toast.success("Connection reconnected.");
    },
    [isValidConnection, setEdges, setNodes],
  );

  const handleAddChild = useCallback(
    (nodeId: string) => {
      setNodes((currentNodes) => {
        const parent = currentNodes.find((node) => node.id === nodeId);

        if (!parent) return currentNodes;

        if (parent.data.nodeType === "subtask") {
          toast.error("Subtasks cannot have children.");
          return currentNodes;
        }

        const childType: RoadmapNodeType =
          parent.data.nodeType === "goal" ? "task" : "subtask";

        const newNode = makeNewChildNode({
          parent,
          nodeType: childType,
          title: t("newNode", { type: t(`types.${childType}`) }),
        });

        setSelectedNodeId(newNode.id);

        setEdges((currentEdges) => [
          ...currentEdges,
          makeEdge(parent.id, newNode.id),
        ]);

        return layoutRoadmapNodes([...currentNodes, newNode]);
      });
      fitViewAfterLayout?.();
    },
    [fitViewAfterLayout, setEdges, setNodes, t],
  );

  function handleChangeNode(
    nodeId: string,
    data: Partial<RoadmapFlowNodeData>,
  ) {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                ...data,
              },
            }
          : node,
      ),
    );
  }

  function handleDeleteNode(nodeId: string) {
    const node = nodeById.get(nodeId);

    if (!node) return;

    const confirmed = window.confirm(
      "Delete this node? Child nodes connected under it will also be deleted.",
    );

    if (!confirmed) return;

    const idsToDelete = new Set<string>([nodeId]);

    let changed = true;

    while (changed) {
      changed = false;

      for (const item of nodes) {
        if (item.data.parentNodeId && idsToDelete.has(item.data.parentNodeId)) {
          if (!idsToDelete.has(item.id)) {
            idsToDelete.add(item.id);
            changed = true;
          }
        }
      }
    }

    startTransition(async () => {
      const result = await deleteRoadmapNodeAction({
        roadmapId: roadmap.id,
        nodeId,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      setNodes((currentNodes) =>
        currentNodes.filter((item) => !idsToDelete.has(item.id)),
      );

      setEdges((currentEdges) =>
        currentEdges.filter(
          (edge) =>
            !idsToDelete.has(edge.source) && !idsToDelete.has(edge.target),
        ),
      );

      if (selectedNodeId && idsToDelete.has(selectedNodeId)) {
        setSelectedNodeId(null);
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  function handleSave() {
    const sortedNodes = computeSortOrders(nodes);

    startTransition(async () => {
      const result = await saveRoadmapEditorStateAction({
        roadmapId: roadmap.id,
        nodes: sortedNodes.map((node) => ({
          id: node.id,
          parentNodeId: node.data.parentNodeId,
          nodeType: node.data.nodeType,
          title: node.data.title,
          description: node.data.description,
          estimatedHours: node.data.estimatedHours,
          suggestedStartDate: node.data.suggestedStartDate,
          suggestedEndDate: node.data.suggestedEndDate,
          priority: node.data.priority,
          sortOrder: node.data.sortOrder,
          positionX: node.position.x,
          positionY: node.position.y,
        })),
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  function handleBackToDetail() {
    router.push(`/roadmaps/${roadmap.id}`);
  }

  const nodesWithCallbacks = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onSelectNode: setSelectedNodeId,
          onAddChild: handleAddChild,
        },
      })),
    [handleAddChild, nodes],
  );

  return (
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("editorTitle")} title={roadmap.title} action={<>
        <Button type="button" variant="outline" size="icon" onClick={handleBackToDetail} aria-label={t("back")} title={t("back")}><ArrowLeft aria-hidden="true" /></Button>
        <Button type="button" variant="outline" size="icon" onClick={handleAutoLayout} disabled={isPending} aria-label={t("autoLayout")} title={t("autoLayout")}><Workflow aria-hidden="true" /></Button>
        <Button type="button" onClick={handleSave} disabled={isPending} aria-busy={isPending}><Save aria-hidden="true" />{isPending ? t("saving") : t("save")}</Button>
      </>} />
      <div className="grid min-w-0 items-start gap-card xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label={t("editorTitle")} className="min-w-0 overflow-hidden rounded-lg border border-border">
          <div className="h-112 min-w-0 md:h-136">
            <ReactFlow className="roadmap-editor-flow"
              nodes={nodesWithCallbacks} edges={edges} nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions} onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange} onConnect={onConnect} onReconnect={onReconnect}
              onInit={onInit} isValidConnection={isValidConnection} edgesReconnectable
              deleteKeyCode={null} minZoom={0.2} fitView fitViewOptions={{ padding: 0.15 }}>
              <MiniMap className="hidden md:block" pannable zoomable nodeColor="var(--elevated)" />
              <Controls />
              <Background color="var(--overlay)" />
            </ReactFlow>
          </div>
        </section>
        <RoadmapNodeEditPanel selectedNode={selectedNode} onChangeNode={handleChangeNode} onDeleteNode={handleDeleteNode} />
      </div>
    </div>
  );
}
