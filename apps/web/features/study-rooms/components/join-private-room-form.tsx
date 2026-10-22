"use client";

import { FormEvent, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";

import { joinPrivateStudyRoomByCodeAction } from "@/features/study-rooms/study-room.actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { KeyRound } from "lucide-react";

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
    <section className="min-w-0 max-w-xl">
      <div className="mb-card">
        <h2 className="text-section text-foreground font-semibold">
          {t("title")}
        </h2>
        <p className="mt-1 text-body text-secondary-text">
          {t("description")}
        </p>
      </div>

      <form onSubmit={handleSubmit} aria-busy={isPending} className="flex min-w-0 flex-col gap-3 sm:flex-row">
        <Input
          type="text"
          aria-label={t("placeholder")}
          required
          minLength={6}
          maxLength={20}
          disabled={isPending}
          autoComplete="off"
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
          placeholder={t("placeholder")}
        />

        <Button type="submit" disabled={isPending}>
          <KeyRound aria-hidden="true" />
          {isPending ? t("joining") : t("submit")}
        </Button>
      </form>
    </section>
  );
}
