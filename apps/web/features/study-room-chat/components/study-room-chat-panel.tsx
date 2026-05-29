"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { sendStudyRoomMessageAction } from "@/features/study-room-chat/study-room-chat.actions";
import type { StudyRoomMessageWithSender } from "@/features/study-room-chat/study-room-chat.types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type StudyRoomChatPanelProps = {
  roomId: string;
  currentUserId: string;
  initialMessages: StudyRoomMessageWithSender[];
};

type BroadcastMessagePayload = {
  record?: {
    id?: string;
    room_id?: string;
    sender_id?: string;
    content?: string;
    created_at?: string;
  };
  new?: {
    id?: string;
    room_id?: string;
    sender_id?: string;
    content?: string;
    created_at?: string;
  };
};

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function StudyRoomChatPanel({
  roomId,
  currentUserId,
  initialMessages,
}: StudyRoomChatPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const formRef = useRef<HTMLFormElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSubmittingRef = useRef(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [content, setContent] = useState("");
  const [messages, setMessages] =
    useState<StudyRoomMessageWithSender[]>(initialMessages);

  const [liveState, setLiveState] = useState<
    "connecting" | "connected" | "error"
  >("connecting");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let mounted = true;

    async function fetchMessageWithSender(messageId: string) {
      const { data, error } = await supabase
        .from("study_room_messages")
        .select(
          `
        id,
        room_id,
        sender_id,
        content,
        created_at,
        profiles:sender_id (
          id,
          full_name
        )
      `,
        )
        .eq("id", messageId)
        .single();

      if (error) {
        console.error("Failed to fetch realtime room message:", error);
        return null;
      }

      return data as StudyRoomMessageWithSender;
    }

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
          .on("broadcast", { event: "INSERT" }, async ({ payload }) => {
            const typedPayload = payload as BroadcastMessagePayload;

            const messageId = typedPayload.record?.id ?? typedPayload.new?.id;

            if (!messageId) {
              return;
            }

            const freshMessage = await fetchMessageWithSender(messageId);

            if (!freshMessage) {
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
      toast.error("Message cannot be empty.");
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
        toast.error("Failed to send message.");
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
    <section className="rounded-2xl max-w-2xl border bg-background p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Room Chat
          </p>

          <h2 className="mt-2 text-2xl font-bold tracking-tight">
            Live conversation
          </h2>

          <p className="mt-2 max-w-2xl text-neutral-600">
            Messages are stored permanently and broadcast to active room members
            in real time.
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
            liveState === "connected"
              ? "bg-emerald-50 text-emerald-700"
              : liveState === "error"
                ? "bg-red-50 text-red-700"
                : "bg-neutral-100 text-neutral-700"
          }`}
        >
          {liveState}
        </span>
      </div>

      <div className="mt-6 flex h-115 flex-col rounded-2xl border bg-surface">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <p className="text-sm text-neutral-500">
                No messages yet. Start the room conversation.
              </p>
            </div>
          ) : (
            messages.map((message) => {
              const isMine = message.sender_id === currentUserId;

              return (
                <article
                  key={message.id}
                  className={`max-w-[88%] rounded-2xl border p-4 ${
                    isMine
                      ? "ml-auto border-background bg-background text-foreground"
                      : "bg-background text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className={`text-sm font-semibold text-foreground}`}>
                      {message.profiles?.full_name ?? "Lumivox User"}
                    </p>

                    <span
                      className={`text-xs ${
                        isMine ? "text-foreground" : "text-foreground"
                      }`}
                    >
                      {formatMessageTime(message.created_at)}
                    </span>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                    {message.content}
                  </p>
                </article>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="border-t bg-background p-4"
        >
          <div className="flex flex-col gap-3 md:flex-row">
            <Textarea
              value={content}
              disabled={isSubmitting}
              onKeyDown={handleKeyDown}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Write a message to the room..."
              rows={1}
              className="w-full h-fit resize-none border px-3 py-2.5 outline-none transition focus:border-neutral-900"
            />

            <Button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Sending..." : "Send"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
