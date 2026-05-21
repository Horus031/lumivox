"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { joinPublicStudyRoomAction } from "@/features/study-rooms/study-room.actions";
import { Button } from "@/components/ui/button";

type RoomCardProps = {
  room: {
    id: string;
    title: string;
    description: string | null;
    visibility: "public" | "private";
    max_participants: number;
    profiles: {
      id: string;
      full_name: string | null;
    } | null;
  };
  mode: "joined" | "discover";
};

export function RoomCard({ room, mode }: RoomCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleJoin() {
    startTransition(async () => {
      const result = await joinPublicStudyRoomAction(room.id);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.push(`/rooms/${result.data.roomId}`);
      router.refresh();
    });
  }

  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm h-full">
      <div className="flex flex-col justify-between h-full">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold capitalize text-neutral-700">
              {room.visibility}
            </span>

            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Up to {room.max_participants} learners
            </span>
          </div>

          <h3 className="text-xl font-bold">{room.title}</h3>

          {room.description ? (
            <p className="mt-2 text-sm leading-6 text-neutral-700">
              {room.description}
            </p>
          ) : null}

          <p className="mt-3 text-sm text-neutral-500">
            Owner: {room.profiles?.full_name ?? "Unknown user"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {mode === "joined" ? (
            <Link
              href={`/rooms/${room.id}`}
              className="bg-transparent w-full text-center border border-primary rounded-md px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary hover:text-white"
            >
              Enter room
            </Link>
          ) : (
            <Button
              onClick={handleJoin}
              disabled={isPending}
              className="border px-4 py-2.5 text-sm font-medium transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Joining..." : "Join room"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
