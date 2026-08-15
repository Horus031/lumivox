"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
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
  const t = useTranslations("rooms.card");
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
    <article className="rounded-2xl border bg-background p-5 shadow-sm h-full">
      <div className="flex flex-col gap-4 justify-between h-full">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold capitalize text-foreground">
              {t(`visibility.${room.visibility}`)}
            </span>

            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {t("capacity", { count: room.max_participants })}
            </span>
          </div>

          <h3 className="text-xl font-bold">{room.title}</h3>

          {room.description ? (
            <p className="mt-2 text-sm leading-6 text-foreground">
              {room.description}
            </p>
          ) : null}

          <p className="mt-3 text-sm text-neutral-500">
            {t("owner", {
              name: room.profiles?.full_name ?? t("unknownUser"),
            })}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {mode === "joined" ? (
            <Link
              href={`/rooms/${room.id}`}
              className="bg-transparent w-full text-center border border-primary rounded-md px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary hover:text-primary-foreground"
            >
              {t("enter")}
            </Link>
          ) : (
            <Button
              onClick={handleJoin}
              disabled={isPending}
              className="border px-4 py-2.5 text-sm font-medium transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? t("joining") : t("join")}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
