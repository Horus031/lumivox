"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { upsertStudyGroupWeeklyChallengeAction } from "@/features/study-groups/study-group.actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";

type StudyGroupWeeklyChallengeFormProps = {
  groupId: string;
  defaultFocusMinutes?: number;
  defaultCompletedTasks?: number;
};

export function StudyGroupWeeklyChallengeForm({
  groupId,
  defaultFocusMinutes,
  defaultCompletedTasks,
}: StudyGroupWeeklyChallengeFormProps) {
  const router = useRouter();
  const t = useTranslations("groups.challengeForm");
  const [title, setTitle] = useState(t("defaultTitle"));
  const [targetFocusMinutes, setTargetFocusMinutes] = useState(
    defaultFocusMinutes ?? 300,
  );
  const [targetCompletedTasks, setTargetCompletedTasks] = useState(
    defaultCompletedTasks ?? 10,
  );
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await upsertStudyGroupWeeklyChallengeAction({
        groupId,
        title,
        targetFocusMinutes,
        targetCompletedTasks,
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
    <form
      onSubmit={handleSubmit}
      aria-busy={isPending}
      className="min-w-0 border-t border-border pt-card"
    >
      <h2 className="text-section font-semibold text-foreground">
        {t("title")}
      </h2>

      <p className="mt-1 text-body text-secondary-text">
        {t("description")}
      </p>

      <fieldset disabled={isPending} className="mt-card grid min-w-0 gap-card sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <label className="min-w-0 space-y-2 sm:col-span-2 lg:col-span-1">
          <span className="text-label font-medium text-foreground">
            {t("fields.title")}
          </span>

          <Input
            value={title}
            required
            minLength={2}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="min-w-0 space-y-2">
          <span className="text-label font-medium text-foreground">
            {t("fields.focusMinutes")}
          </span>

          <Input
            value={targetFocusMinutes}
            onChange={(event) =>
              setTargetFocusMinutes(Number(event.target.value))
            }
            type="number"
            min={0}
            max={10000}
            required
            step={1}
          />
        </label>

        <label className="min-w-0 space-y-2">
          <span className="text-label font-medium text-foreground">
            {t("fields.completedTasks")}
          </span>

          <Input
            value={targetCompletedTasks}
            onChange={(event) =>
              setTargetCompletedTasks(Number(event.target.value))
            }
            type="number"
            min={0}
            max={1000}
            required
            step={1}
          />
        </label>
        <Button
          type="submit"
          disabled={isPending}
          className="justify-self-start lg:justify-self-end"
        >
          <Save aria-hidden="true" />
          {isPending ? t("saving") : t("save")}
        </Button>
      </fieldset>
    </form>
  );
}
