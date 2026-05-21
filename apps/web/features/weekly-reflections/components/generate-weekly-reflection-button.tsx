"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { generateWeeklyReflectionAction } from "@/features/weekly-reflections/weekly-reflection.actions";
import { Button } from "@/components/ui/button";

export function GenerateWeeklyReflectionButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateWeeklyReflectionAction();

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <Button
      onClick={handleGenerate}
      disabled={isPending}
    >
      {isPending ? "Generating reflection..." : "Generate Weekly Reflection"}
    </Button>
  );
}
