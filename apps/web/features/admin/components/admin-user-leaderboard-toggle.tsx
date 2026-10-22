"use client";

import { useId, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { updateAdminUserLeaderboardVisibilityAction } from "@/features/admin/admin-users.actions";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type AdminUserLeaderboardToggleProps = {
  userId: string;
  currentValue: boolean;
};

export function AdminUserLeaderboardToggle({
  userId,
  currentValue,
}: AdminUserLeaderboardToggleProps) {
  const router = useRouter();
  const t = useTranslations("admin.common.visibility");
  const commonT = useTranslations("admin.common");
  const id = useId();
  const [isPending, startTransition] = useTransition();

  function handleChange(nextValue: boolean) {
    if (isPending || nextValue === currentValue) return;
    startTransition(async () => {
      const result = await updateAdminUserLeaderboardVisibilityAction({
        userId,
        leaderboardOptIn: nextValue,
      });

      if (!result.success) {
        toast.error(result.message);
        router.refresh();
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <Label htmlFor={id} className="flex min-h-touch cursor-pointer items-center gap-2 text-label text-foreground sm:min-h-control">
      <Checkbox
        id={id}
        aria-label={`${commonT("leaderboardVisibility")}: ${userId}`}
        aria-busy={isPending}
        checked={currentValue}
        disabled={isPending}
        onCheckedChange={(checked) => handleChange(checked === true)}
      />

      <span>{currentValue ? t("visible") : t("hidden")}</span>
    </Label>
  );
}
