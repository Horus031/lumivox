"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { joinPublicStudyRoomAction } from "@/features/study-rooms/study-room.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Users } from "lucide-react";

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
    <article className="h-full min-w-0 rounded-lg border border-border bg-card p-card">
      <div className="flex h-full flex-col justify-between gap-card">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {t(`visibility.${room.visibility}`)}
            </Badge>

            <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
              <Users className="size-icon-sm" aria-hidden="true" />
              {t("capacity", { count: room.max_participants })}
            </span>
          </div>

          <h3 className="text-section font-semibold [overflow-wrap:anywhere]">{room.title}</h3>

          {room.description ? (
            <p className="mt-1 line-clamp-3 text-body text-secondary-text [overflow-wrap:anywhere]" title={room.description}>
              {room.description}
            </p>
          ) : null}

          <p className="mt-3 text-caption text-muted-foreground [overflow-wrap:anywhere]">
            {t("owner", {
              name: room.profiles?.full_name ?? t("unknownUser"),
            })}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {mode === "joined" ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/rooms/${room.id}`}><ArrowRight aria-hidden="true" />{t("enter")}</Link>
            </Button>
          ) : (
            <Button
              onClick={handleJoin}
              disabled={isPending}
              size="sm"
              aria-busy={isPending}
            >
              <ArrowRight aria-hidden="true" />
              {isPending ? t("joining") : t("join")}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
