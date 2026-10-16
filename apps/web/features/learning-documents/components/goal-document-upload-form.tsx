"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { uploadGoalLearningDocumentAction } from "@/features/learning-documents/learning-document.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload } from "lucide-react";

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
      aria-busy={isPending} className="min-w-0 border-t border-border pt-card"
    >
      <input type="hidden" name="goalId" value={goalId} />

      <div>
        <p className="text-caption font-medium text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h3 className="mt-1 text-section font-semibold text-foreground">
          {t("title")}
        </h3>

        <p className="mt-1 text-body text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <div className="mt-3">
        <Input
          aria-label={t("title")}
          required
          name="file"
          type="file"
          accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,text/plain,text/markdown,image/png,image/jpeg,image/webp"
          disabled={isPending}
          className="h-auto min-h-touch py-2 file:mr-3 file:rounded-sm file:bg-muted file:px-2 file:py-1"
        />
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="mt-3"
      >
        <Upload aria-hidden="true" />{isPending ? t("uploading") : t("button")}
      </Button>
    </form>
  );
}
