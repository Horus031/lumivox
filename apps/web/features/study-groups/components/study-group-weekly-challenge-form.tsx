"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { upsertStudyGroupWeeklyChallengeAction } from "@/features/study-groups/study-group.actions";

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
      className="rounded-2xl border bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <h2 className="text-xl font-bold text-neutral-950 dark:text-neutral-50">
        {t("title")}
      </h2>

      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        {t("description")}
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="space-y-2 md:col-span-3">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("fields.title")}
          </span>

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("fields.focusMinutes")}
          </span>

          <input
            value={targetFocusMinutes}
            onChange={(event) =>
              setTargetFocusMinutes(Number(event.target.value))
            }
            type="number"
            min={0}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("fields.completedTasks")}
          </span>

          <input
            value={targetCompletedTasks}
            onChange={(event) =>
              setTargetCompletedTasks(Number(event.target.value))
            }
            type="number"
            min={0}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-5 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
      >
        {isPending ? t("saving") : t("save")}
      </button>
    </form>
  );
}
