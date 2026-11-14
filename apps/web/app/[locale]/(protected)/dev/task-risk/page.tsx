
import { notFound } from "next/navigation";

import { TaskRiskFoundationPreview } from "@/features/native-task-risk/components/task-risk-foundation-preview";

export default function TaskRiskFoundationPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <TaskRiskFoundationPreview />;
}
