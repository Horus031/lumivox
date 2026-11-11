"use client";

import dynamic from "next/dynamic";
import type { WorkspacePagedBoardProps } from "./workspace-paged-board";

const Board = dynamic(() => import("./workspace-paged-board").then((module) => module.WorkspacePagedBoard));

export function WorkspaceBoardLoader(props: WorkspacePagedBoardProps) {
  return <Board {...props} />;
}
