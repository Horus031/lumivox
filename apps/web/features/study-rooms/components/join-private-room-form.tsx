"use client";

import { FormEvent, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";

import { joinPrivateStudyRoomByCodeAction } from "@/features/study-rooms/study-room.actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function JoinPrivateRoomForm() {
  const router = useRouter();
  const t = useTranslations("rooms.joinPrivate");
  const [isPending, startTransition] = useTransition();
  const [inviteCode, setInviteCode] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await joinPrivateStudyRoomByCodeAction(inviteCode);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setInviteCode("");

      router.push(`/rooms/${result.data.roomId}`);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-sm uppercase text-foreground font-semibold">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-foreground">
          {t("description")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 md:flex-row">
        <Input
          type="text"
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
          placeholder={t("placeholder")}
        />

        <Button type="submit" disabled={isPending}>
          {isPending ? t("joining") : t("submit")}
        </Button>
      </form>
    </section>
  );
}
