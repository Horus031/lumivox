"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { generateCurrentPbiSnapshotAction } from "@/features/pbi/pbi.actions";

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
    <button
      onClick={handleRefresh}
      disabled={isPending}
      className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? t("calculating") : t("button")}
    </button>
  );
}
