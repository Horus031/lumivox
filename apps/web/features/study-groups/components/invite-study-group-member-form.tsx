"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { inviteStudyGroupMemberAction } from "@/features/study-groups/study-group.actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

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
      aria-busy={isPending}
      className="min-w-0 border-t border-border pt-card"
    >
      <h2 className="text-section font-semibold text-foreground">
        {t("title")}
      </h2>

      <p className="mt-1 text-body text-secondary-text">
        {t("description")}
      </p>

      <div className="mt-3 flex max-w-xl flex-col gap-3 sm:flex-row">
        <Input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          disabled={isPending}
          aria-label={t("emailLabel")}
          placeholder={t("placeholder")}
        />

        <Button
          type="submit"
          disabled={isPending}
        >
          <UserPlus aria-hidden="true" />
          {isPending ? t("inviting") : t("invite")}
        </Button>
      </div>
    </form>
  );
}
