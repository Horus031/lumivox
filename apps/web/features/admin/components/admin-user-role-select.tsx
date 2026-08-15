"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { updateAdminUserRoleAction } from "@/features/admin/admin-users.actions";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AdminUserRoleSelectProps = {
  userId: string;
  currentRole: "user" | "admin";
};

export function AdminUserRoleSelect({
  userId,
  currentRole,
}: AdminUserRoleSelectProps) {
  const router = useRouter();
  const t = useTranslations("admin.common.roles");
  const [isPending, startTransition] = useTransition();

  function handleChange(nextRole: "user" | "admin") {
    startTransition(async () => {
      const result = await updateAdminUserRoleAction({
        userId,
        role: nextRole,
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
    <>
      <Select
        value={currentRole}
        disabled={isPending}
        onValueChange={(value) => handleChange(value as "user" | "admin")}
      >
        <SelectTrigger className="w-full max-w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Roles</SelectLabel>
            <SelectItem value="user">{t("user")}</SelectItem>
            <SelectItem value="admin">{t("admin")}</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  );
}
