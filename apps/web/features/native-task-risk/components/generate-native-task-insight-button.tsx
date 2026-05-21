"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { generateNativeTaskRiskInsightAction } from "@/features/native-task-risk/native-task-risk-insight.actions";

type GenerateNativeTaskInsightButtonProps = {
  assessmentId: string;
};

export function GenerateNativeTaskInsightButton({
  assessmentId,
}: GenerateNativeTaskInsightButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      const result =
        await generateNativeTaskRiskInsightAction(assessmentId);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={isPending}
      className="rounded-xl border border-border/70 bg-card px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-primary/20 hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? "Generating insight..." : "Generate AI Insight"}
    </button>
  );
}