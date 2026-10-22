"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { sendStudyRoomMessageAction } from "@/features/study-room-chat/study-room-chat.actions";
import type { StudyRoomMessageWithSender } from "@/features/study-room-chat/study-room-chat.types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";

type StudyRoomChatPanelProps = {
  roomId: string;
  currentUserId: string;
  initialMessages: StudyRoomMessageWithSender[];
};

function formatMessageTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function StudyRoomChatPanel({
  roomId,
  currentUserId,
  initialMessages,
}: StudyRoomChatPanelProps) {
  const locale = useLocale();
  const t = useTranslations("rooms.chat");
  const supabase = useMemo(() => createClient(), []);
  const formRef = useRef<HTMLFormElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isSubmittingRef = useRef(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [content, setContent] = useState("");
  const [messages, setMessages] =
    useState<StudyRoomMessageWithSender[]>(initialMessages);

  const [liveState, setLiveState] = useState<
    "connecting" | "connected" | "error"
  >("connecting");

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    // Update only the chat container scroll position and avoid viewport movement.
    container.scrollTop = container.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    let mounted = true;

    async function subscribeToRoomChat() {
      try {
        await supabase.realtime.setAuth();

        if (!mounted) return;

        const channel = supabase
          .channel(`study-room-chat:${roomId}`, {
            config: {
              private: true,
            },
          })
          .on("broadcast", { event: "INSERT" }, ({ payload }) => {
            const freshMessage = payload as StudyRoomMessageWithSender;

            if (!freshMessage?.id || freshMessage.room_id !== roomId) {
              return;
            }

            setMessages((current) => {
              const alreadyExists = current.some(
                (message) => message.id === freshMessage.id,
              );

              if (alreadyExists) {
                return current;
              }

              return [...current, freshMessage];
            });
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              setLiveState("connected");
            }

            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setLiveState("error");
            }
          });

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (error) {
        console.error("Study room chat realtime failed:", error);
        setLiveState("error");
      }
    }

    let cleanup: (() => void) | undefined;

    void subscribeToRoomChat().then((result) => {
      cleanup = result;
    });

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [roomId, supabase]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    const trimmed = content.trim();

    if (!trimmed) {
      toast.error(t("errors.empty"));
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    void (async () => {
      try {
        const result = await sendStudyRoomMessageAction({
          roomId,
          content: trimmed,
        });

        if (!result.success) {
          toast.error(result.message);
          return;
        }

        setContent("");
      } catch (error) {
        console.error("Failed to send study room message:", error);
        toast.error(t("errors.failed"));
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    })();
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSubmittingRef.current) {
      e.preventDefault();
      return;
    }

    // Check for Enter key without Shift
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevent adding a new line

      // Submit the form manually
      if (formRef.current) {
        formRef.current.requestSubmit();
      }
    }
  };

  return (
    <section className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-section font-semibold text-foreground">{t("title")}</h2>
        <span role="status" className={`rounded-sm px-2 py-0.5 text-caption font-medium ${liveState === "connected" ? "bg-success/10 text-success" : liveState === "error" ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground"}`}>
          {t(`connection.${liveState}`)}
        </span>
      </div>
      <div className="flex h-96 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card md:h-112">
        <div ref={messagesContainerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" tabIndex={0} aria-label={t("title")}>
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <p className="max-w-sm text-body text-muted-foreground">{t("empty")}</p>
            </div>
          ) : messages.map((message) => {
            const isMine = message.sender_id === currentUserId;
            return (
              <article key={message.id} className={`w-fit max-w-[92%] rounded-lg px-3 py-2 ${isMine ? "ml-auto bg-primary/10" : "bg-muted"}`}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 text-label font-medium text-foreground [overflow-wrap:anywhere]">{message.profiles?.full_name ?? t("lumivoxUser")}</p>
                  <time dateTime={message.created_at} className="text-caption text-muted-foreground">
                    {formatMessageTime(message.created_at, locale)}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-body text-foreground [overflow-wrap:anywhere]">{message.content}</p>
              </article>
            );
          })}
        </div>
        <form ref={formRef} onSubmit={handleSubmit} aria-busy={isSubmitting} className="flex items-end gap-2 border-t border-border p-3">
          <Textarea value={content} onChange={(event) => setContent(event.target.value)}
            onKeyDown={handleKeyDown} maxLength={2000} disabled={isSubmitting} rows={2}
            aria-label={t("placeholder")} placeholder={t("placeholder")}
            className="max-h-32 min-h-touch min-w-0 flex-1 resize-none" />
          <Button type="submit" size="icon" disabled={isSubmitting || !content.trim()}
            aria-label={isSubmitting ? t("sending") : t("send")} title={isSubmitting ? t("sending") : t("send")}>
            <Send aria-hidden="true" />
          </Button>
        </form>
      </div>
    </section>
  );
}
