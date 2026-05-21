"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { joinPrivateStudyRoomByCodeAction } from "@/features/study-rooms/study-room.actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function JoinPrivateRoomForm() {
  const router = useRouter();
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
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-sm uppercase text-neutral-600 font-semibold">Join a private room</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Enter an invite code shared by the room owner.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 md:flex-row">
        <Input
          type="text"
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
          placeholder="E7F8A2C1"
        />

        <Button type="submit" disabled={isPending}>
          {isPending ? "Joining..." : "Join with code"}
        </Button>
      </form>
    </section>
  );
}
