"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { UserMinus } from "lucide-react";

import type { Database } from "@/types/database.types";
import { removeLearningDocumentPermissionAction } from "@/features/learning-documents/learning-document-sharing.actions";
import { Button } from "@/components/ui/button";

type Permission =
  Database["public"]["Tables"]["learning_document_permissions"]["Row"];

type DocumentPermissionListProps = {
  permissions: Permission[];
};

export function DocumentPermissionList({
  permissions,
}: DocumentPermissionListProps) {
  const t = useTranslations("documentUi");
  if (permissions.length === 0) {
    return (
      <section className="min-w-0 border-t border-border pt-card ">
        <h2 className="text-section font-semibold text-foreground [overflow-wrap:anywhere]">
          {t("permissionsTitle")}
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          {t("permissionsEmpty")}
        </p>
      </section>
    );
  }

  return (
    <section className="min-w-0 border-t border-border pt-card">
      <h2 className="text-section font-semibold text-foreground">
        {t("permissionsTitle")}
      </h2>

      <div className="mt-2 divide-y divide-border">
        {permissions.map((permission) => (
          <PermissionRow key={permission.id} permission={permission} />
        ))}
      </div>
    </section>
  );
}

function PermissionRow({ permission }: { permission: Permission }) {
  const router = useRouter();
  const t = useTranslations("documentUi");
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      const result = await removeLearningDocumentPermissionAction(
        permission.id,
      );

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-body font-medium text-foreground [overflow-wrap:anywhere]">
          {permission.user_email}
        </p>

        <p className="mt-1 text-caption text-muted-foreground">
          {t(`roles.${permission.role}`)}
        </p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-danger hover:text-danger"
        aria-label={`${t("remove")}: ${permission.user_email}`}
        title={isPending ? t("removing") : t("remove")}
        onClick={handleRemove}
        disabled={isPending}
      >
        <UserMinus aria-hidden="true" />
      </Button>
    </div>
  );
}
