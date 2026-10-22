"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { generateWeeklyReflectionAction } from "@/features/weekly-reflections/weekly-reflection.actions";
import { Button } from "@/components/ui/button";

export function GenerateWeeklyReflectionButton() {
  const router = useRouter();
  const t = useTranslations("reflections.generateButton");
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    if (isPending) return;
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
      type="button"
      onClick={handleGenerate}
      disabled={isPending}
      aria-busy={isPending}
    >
      {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
      {isPending ? t("generating") : t("generate")}
    </Button>
  );
}
