"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";

import { createStudyGroupAction } from "@/features/study-groups/study-group.actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function CreateStudyGroupForm() {
  const router = useRouter();
  const t = useTranslations("groups.createForm");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await createStudyGroupAction({
        title,
        description,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setTitle("");
      setDescription("");

      if (result.data?.groupId) {
        router.push(`/groups/${result.data.groupId}`);
        return;
      }

      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border bg-background space-y-4 p-6 shadow-sm"
    >
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {t("eyebrow")}
      </p>

      <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
        {t("title")}
      </h2>

      <p className="mt-2 text-sm text-muted-foreground">
        {t("description")}
      </p>

      <div className="mt-5 space-y-4">
        <div className="block space-y-2">
          <Label>{t("fields.name")}</Label>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            placeholder={t("placeholders.name")}
          />
        </div>

        <div className="block space-y-2">
          <Label>{t("fields.description")}</Label>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            placeholder={t("placeholders.name")}
          />
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-muted-foreground">
            {t("fields.description")}
          </span>

          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            placeholder={t("placeholders.description")}
          />
        </label>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? t("creating") : t("create")}
      </Button>
    </form>
  );
}
