"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type {
  LearningDocument,
  LearningDocumentVisibility,
} from "@/features/learning-documents/learning-document.types";
import { updateLearningDocumentVisibilityAction } from "@/features/learning-documents/learning-document-sharing.actions";

type DocumentVisibilityControlProps = {
  document: LearningDocument;
};

export function DocumentVisibilityControl({
  document,
}: DocumentVisibilityControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: LearningDocumentVisibility) {
    startTransition(async () => {
      const result = await updateLearningDocumentVisibilityAction({
        documentId: document.id,
        visibility: value,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Visibility
        </p>

        <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
          Document access mode
        </h2>

        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Private documents are only visible to you. Shared documents are
          visible to specific email permissions. Public documents are visible
          to authenticated users with the link.
        </p>
      </div>

      <div className="mt-5">
        <select
          value={document.visibility}
          disabled={isPending}
          onChange={(event) =>
            handleChange(event.target.value as LearningDocumentVisibility)
          }
          className="w-full max-w-sm rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900 disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-400"
        >
          <option value="private">Private</option>
          <option value="shared">Shared by email</option>
          <option value="public">Public link</option>
        </select>
      </div>
    </section>
  );
}