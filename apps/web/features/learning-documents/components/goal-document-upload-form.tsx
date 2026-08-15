"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { uploadGoalLearningDocumentAction } from "@/features/learning-documents/learning-document.actions";
import { Button } from "@/components/ui/button";

type GoalDocumentUploadFormProps = {
  goalId: string;
};

export function GoalDocumentUploadForm({
  goalId,
}: GoalDocumentUploadFormProps) {
  const t = useTranslations("goals.documents.upload");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await uploadGoalLearningDocumentAction(formData);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="rounded-2xl border bg-background p-5 shadow-sm"
    >
      <input type="hidden" name="goalId" value={goalId} />

      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h3 className="mt-2 text-xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h3>

        <p className="mt-2 text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <div className="mt-5">
        <input
          name="file"
          type="file"
          accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,text/plain,text/markdown,image/png,image/jpeg,image/webp"
          disabled={isPending}
          className="block w-full rounded-xl border bg-background px-3 py-2.5 text-sm text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-background file:text-foreground file:px-4 file:py-2 file:text-sm file:font-medium cursor-pointer"
        />
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="mt-4 px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? t("uploading") : t("button")}
      </Button>
    </form>
  );
}
