"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type {
  LearningDocument,
  LearningDocumentVisibility,
} from "@/features/learning-documents/learning-document.types";
import { updateLearningDocumentVisibilityAction } from "@/features/learning-documents/learning-document-sharing.actions";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Visibility
        </p>

        <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          Document access mode
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          Private documents are only visible to you. Shared documents are
          visible to specific email permissions. Public documents are visible to
          authenticated users with the link.
        </p>
      </div>

      <div className="mt-5">
        <Select
          disabled={isPending}
          value={document.visibility}
          onValueChange={(value) =>
            handleChange(value as LearningDocumentVisibility)
          }
        >
          <SelectTrigger className="w-full max-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Visibilities</SelectLabel>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="shared">Shared by email</SelectItem>
              <SelectItem value="public">Public link</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* <select
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
        </select> */}
      </div>
    </section>
  );
}
