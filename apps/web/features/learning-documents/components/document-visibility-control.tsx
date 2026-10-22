"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";

import type {
  LearningDocument,
  LearningDocumentVisibility,
} from "@/features/learning-documents/learning-document.types";
import { updateLearningDocumentVisibilityAction } from "@/features/learning-documents/learning-document-sharing.actions";
import {
  Select,
  SelectContent,
  SelectItem,
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
  const t = useTranslations("documentUi");
  const id = useId();
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
    <section aria-busy={isPending} className="min-w-0 border-t border-border pt-card">
      <h2 className="text-section font-semibold">{t("visibilityTitle")}</h2>
      <p className="mt-1 max-w-3xl text-body text-secondary-text">{t("visibilityDescription")}</p>
      <div className="mt-3 max-w-xs space-y-2">
        <Label htmlFor={id}>{t("visibilityField")}</Label>
        <Select disabled={isPending} value={document.visibility} onValueChange={(value) => handleChange(value as LearningDocumentVisibility)}>
          <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["private", "shared", "public"] as const).map((visibility) => <SelectItem key={visibility} value={visibility}>{t(`visibility.${visibility}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}
