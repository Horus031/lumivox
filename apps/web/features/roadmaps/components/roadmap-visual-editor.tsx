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
  type OnReconnect,
} from "@xyflow/react";
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
}: {
  parent: RoadmapFlowNodeType;
  nodeType: RoadmapNodeType;
}): RoadmapFlowNodeType {
  const id = crypto.randomUUID();

  const childOffsetX = nodeType === "task" ? 180 : 120;
  const childOffsetY = 260;

  return {
    id,
    type: "roadmapNode",
    position: {
      x: parent.position.x + childOffsetX,
      y: parent.position.y + childOffsetY,
    },
    data: {
      nodeType,
      parentNodeId: parent.id,
      title: nodeType === "task" ? "New task" : "New subtask",
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<RoadmapFlowNodeType>(
    toFlowNodes(initialNodes),
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
        });

        setSelectedNodeId(newNode.id);

        setEdges((currentEdges) => [
          ...currentEdges,
          makeEdge(parent.id, newNode.id),
        ]);

        return [...currentNodes, newNode];
      });
    },
    [setEdges, setNodes],
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
    <div className="grid min-h-190 gap-6 xl:grid-cols-[1fr_380px]">
      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex flex-col justify-between gap-4 border-b p-5 dark:border-neutral-800 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Visual Roadmap Editor
            </p>

            <h1 className="mt-1 text-2xl font-bold text-neutral-950 dark:text-neutral-50">
              {roadmap.title}
            </h1>

            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Drag nodes, reconnect valid edges, edit details, then save.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleBackToDetail}
              className="rounded-xl border px-4 py-2.5 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
            >
              Back
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
            >
              {isPending ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>

        <div className="h-165">
          <ReactFlow
            nodes={nodesWithCallbacks}
            edges={edges}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            isValidConnection={isValidConnection}
            edgesReconnectable
            deleteKeyCode={null}
            fitView
          >
            <MiniMap pannable zoomable />
            <Controls />
            <Background />
          </ReactFlow>
        </div>
      </section>

      <RoadmapNodeEditPanel
        selectedNode={selectedNode}
        onChangeNode={handleChangeNode}
        onDeleteNode={handleDeleteNode}
      />
    </div>
  );
}
