"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { updateAdminUserLeaderboardVisibilityAction } from "@/features/admin/admin-users.actions";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

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
  const [isPending, startTransition] = useTransition();

  function handleChange(nextValue: boolean) {
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
    <Label className="flex items-center gap-2 text-sm text-foreground">
      <Input
        type="checkbox"
        checked={currentValue}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.checked)}
        className="h-4 w-4"
      />

      <span>{currentValue ? t("visible") : t("hidden")}</span>
    </Label>
  );
}
