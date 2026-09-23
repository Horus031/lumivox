"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { generateCurrentPbiSnapshotAction } from "@/features/pbi/pbi.actions";
import { Button } from "@/components/ui/button";

export function RefreshPbiButton() {
  const t = useTranslations("dashboard.refreshPbi");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    startTransition(async () => {
      const result = await generateCurrentPbiSnapshotAction();

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
      onClick={handleRefresh}
      disabled={isPending}
    >
      {isPending ? t("calculating") : t("button")}
    </Button>
  );
}
