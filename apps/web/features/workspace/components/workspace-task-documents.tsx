"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getTaskDocumentsAction } from "@/features/tasks/task.actions";
import { TaskDocumentsPanel } from "@/features/tasks/components/task-documents-panel";
import type { LearningDocumentListItem } from "@/features/learning-documents/learning-document.types";
import { Link } from "@/i18n/navigation";

export function WorkspaceTaskDocuments({ taskId, goalId }: { taskId: string; goalId: string | null }) {
  const t = useTranslations("workspace.phase3");
  const [documents, setDocuments] = useState<LearningDocumentListItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await getTaskDocumentsAction(taskId);
      if (result.success) {
        setDocuments(result.data);
        setFailed(false);
      } else {
        setFailed(true);
        toast.error(result.message);
      }
    });
  }, [taskId]);

  useEffect(refresh, [refresh]);

  return (
    <div className="space-y-3" aria-busy={pending}>
      {goalId && <Button variant="outline" size="sm" asChild>
        <Link href={`/workspace?goal=${goalId}&section=documents`} prefetch={false}>{t("goalDocuments")}</Link>
      </Button>}
      {documents ? <TaskDocumentsPanel taskId={taskId} documents={documents} onChanged={refresh} /> :
        failed ? <Button variant="outline" onClick={refresh}>{t("retry")}</Button> :
          <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>}
    </div>
  );
}
