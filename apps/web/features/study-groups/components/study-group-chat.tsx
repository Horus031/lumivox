"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { sendStudyGroupMessageAction } from "@/features/study-groups/study-group.actions";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";

type Message = {
  message_id: string;
  room_id: string;
  user_id: string;
  email: string | null;
  content: string;
  created_at: string;
};

type StudyGroupChatProps = {
  groupId: string;
  currentUserId: string;
  currentUserEmail: string | null;
  initialMessages: Message[];
};

function getDisplayName(message: Message) {
  return message.email || `User ${message.user_id.slice(0, 8)}`;
}

export function StudyGroupChat({
  groupId,
  currentUserId,
  initialMessages,
}: StudyGroupChatProps) {
  const locale = useLocale();
  const t = useTranslations("groups.chat");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [content, setContent] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("CONNECTING");
  const [isPending, startTransition] = useTransition();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const supabase = useMemo(() => createClient(), []);

  function appendMessage(message: Message) {
    setMessages((current) => {
      const alreadyExists = current.some(
        (item) => item.message_id === message.message_id,
      );

      if (alreadyExists) {
        return current;
      }

      return [...current, message];
    });
  }

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    const channel = supabase
      .channel(`study-group-chat:${groupId}`, {
        config: {
          private: true,
          broadcast: {
            self: false,
          },
        },
      })
      .on(
        "broadcast",
        {
          event: "new_message",
        },
        ({ payload }) => {
          const message = payload as Message;
          appendMessage(message);
        },
      )
      .subscribe((status) => {
        setConnectionStatus(status);
      });

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [groupId, supabase]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanContent = content.trim();

    if (!cleanContent) return;

    startTransition(async () => {
      const result = await sendStudyGroupMessageAction({
        groupId,
        content: cleanContent,
      });

      if (!result.success || !result.data) {
        toast.error(result.message);
        return;
      }

      const message = result.data;

      appendMessage(message);

      const channel = channelRef.current;

      if (channel) {
        await channel.send({
          type: "broadcast",
          event: "new_message",
          payload: message,
        });
      }

      setContent("");
    });
  }

  const isConnected = connectionStatus === "SUBSCRIBED";

  return (
    <section className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-section font-semibold text-foreground">{t("title")}</h2>
        <span role="status" className={`rounded-sm px-2 py-0.5 text-caption font-medium ${isConnected ? "bg-success/10 text-success" : connectionStatus === "CHANNEL_ERROR" || connectionStatus === "TIMED_OUT" || connectionStatus === "CLOSED" ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground"}`}>
          {isConnected ? t("realtime") : t(`connection.${connectionStatus === "CHANNEL_ERROR" || connectionStatus === "TIMED_OUT" || connectionStatus === "CLOSED" ? "error" : "connecting"}`)}
        </span>
      </div>
      <div className="flex h-96 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card md:h-112">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" tabIndex={0} aria-label={t("title")}>
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <p className="max-w-sm text-body text-muted-foreground">{t("empty")}</p>
            </div>
          ) : messages.map((message) => {
            const isMine = message.user_id === currentUserId;
            return (
              <article key={message.message_id} className={`w-fit max-w-[92%] rounded-lg px-3 py-2 ${isMine ? "ml-auto bg-primary/10" : "bg-muted"}`}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 text-label font-medium text-foreground [overflow-wrap:anywhere]">{isMine ? t("you") : getDisplayName(message)}</p>
                  <time dateTime={message.created_at} className="text-caption text-muted-foreground">
                    {new Date(message.created_at).toLocaleString(locale)}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-body text-foreground [overflow-wrap:anywhere]">{message.content}</p>
              </article>
            );
          })}
        </div>
        <form onSubmit={handleSubmit} aria-busy={isPending} className="flex items-end gap-2 border-t border-border p-3">
          <Textarea value={content} onChange={(event) => setContent(event.target.value)}
            maxLength={2000} disabled={isPending} rows={2}
            aria-label={t("placeholder")} placeholder={t("placeholder")}
            className="max-h-32 min-h-touch min-w-0 flex-1 resize-none" />
          <Button type="submit" size="icon" disabled={isPending || !content.trim()}
            aria-label={isPending ? t("sending") : t("send")} title={isPending ? t("sending") : t("send")}>
            <Send aria-hidden="true" />
          </Button>
        </form>
      </div>
    </section>
  );
}
