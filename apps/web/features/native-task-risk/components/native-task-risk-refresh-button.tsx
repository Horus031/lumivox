"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { refreshNativeTaskRiskPredictionsAction } from "@/features/native-task-risk/native-task-risk.actions";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function NativeTaskRiskRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    startTransition(async () => {
      const result = await refreshNativeTaskRiskPredictionsAction();

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      if (result.data.predictedCount === 0) {
        toast.info(result.message);
      } else {
        toast.success(result.message);
      }

      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      onClick={handleRefresh}
      disabled={isPending}
    >
      {isPending ? "Checking..." : "Refresh risk"}
    </Button>
  );
}