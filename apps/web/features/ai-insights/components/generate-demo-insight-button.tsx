"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { generateDemoAiInsightAction } from "@/features/ai-insights/ai-insight.actions";

export function GenerateDemoInsightButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateDemoAiInsightAction();

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
      className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending
        ? "Generating AI insight..."
        : "Generate AI Demo Insight"}
    </button>
  );
}