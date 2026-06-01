"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Database } from "@/types/database.types";
import { removeLearningDocumentPermissionAction } from "@/features/learning-documents/learning-document-sharing.actions";

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
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-xl font-bold text-neutral-950 dark:text-neutral-50">
          Shared users
        </h2>

        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          This document has not been shared with specific users yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <h2 className="text-xl font-bold text-neutral-950 dark:text-neutral-50">
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
        permission.id
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
    <div className="flex flex-col justify-between gap-3 rounded-2xl border p-4 dark:border-neutral-800 md:flex-row md:items-center">
      <div>
        <p className="font-semibold text-neutral-950 dark:text-neutral-50">
          {permission.user_email}
        </p>

        <p className="mt-1 text-sm capitalize text-neutral-600 dark:text-neutral-400">
          Role: {permission.role}
        </p>
      </div>

      <button
        type="button"
        onClick={handleRemove}
        disabled={isPending}
        className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
      >
        {isPending ? "Removing..." : "Remove"}
      </button>
    </div>
  );
}