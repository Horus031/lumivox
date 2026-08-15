"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
  if (permissions.length === 0) {
    return (
      <section className="rounded-2xl border bg-background p-6 shadow-sm ">
        <h2 className="text-xl font-bold text-foreground">
          Shared users
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          This document has not been shared with specific users yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <h2 className="text-xl font-bold text-foreground">
        Shared users
      </h2>

      <div className="mt-5 space-y-3">
        {permissions.map((permission) => (
          <PermissionRow key={permission.id} permission={permission} />
        ))}
      </div>
    </section>
  );
}

function PermissionRow({ permission }: { permission: Permission }) {
  const router = useRouter();
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
    <div className="flex flex-col justify-between gap-3 rounded-2xl border p-4 md:flex-row md:items-center">
      <div>
        <p className="font-semibold text-foreground">
          {permission.user_email}
        </p>

        <p className="mt-1 text-sm capitalize text-muted-foreground">
          Role: {permission.role}
        </p>
      </div>

      <Button
        type="button"
        variant={"destructive"}
        onClick={handleRemove}
        disabled={isPending}
      >
        {isPending ? "Removing..." : "Remove"}
      </Button>
    </div>
  );
}
