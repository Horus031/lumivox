"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { inviteStudyGroupMemberAction } from "@/features/study-groups/study-group.actions";

type InviteStudyGroupMemberFormProps = {
  groupId: string;
};

export function InviteStudyGroupMemberForm({
  groupId,
}: InviteStudyGroupMemberFormProps) {
  const router = useRouter();
  const t = useTranslations("groups.inviteForm");
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await inviteStudyGroupMemberAction({
        groupId,
        email,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setEmail("");
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

      <div className="mt-4 flex flex-col gap-3 md:flex-row">
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          placeholder={t("placeholder")}
          className="flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
        />

        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          {isPending ? t("inviting") : t("invite")}
        </button>
      </div>
    </form>
  );
}
