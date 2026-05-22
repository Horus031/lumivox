"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { restoreStreakWithTokensAction } from "@/features/engagement-retention/engagement-retention.actions";

type RestoreStreakButtonProps = {
  disabled?: boolean;
};

export function RestoreStreakButton({
  disabled = false,
}: RestoreStreakButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreStreakWithTokensAction();

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
      onClick={handleRestore}
      disabled={disabled || isPending}
      className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? "Restoring..." : "Restore Streak"}
    </button>
  );
}