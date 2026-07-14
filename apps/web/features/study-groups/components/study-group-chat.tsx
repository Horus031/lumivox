"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";

import { sendStudyGroupMessageAction } from "@/features/study-groups/study-group.actions";
import { createClient } from "@/lib/supabase/client";

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

function normalizePostgresMessage(payload: {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
}): Message {
  return {
    message_id: payload.id,
    room_id: payload.room_id,
    user_id: payload.user_id,
    email: null,
    content: payload.content,
    created_at: payload.created_at,
  };
}

export function StudyGroupChat({
  groupId,
  currentUserId,
  currentUserEmail,
  initialMessages,
}: StudyGroupChatProps) {
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
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "study_room_messages",
          filter: `room_id=eq.${groupId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            room_id: string;
            user_id: string;
            content: string;
            created_at: string;
          };

          const message = normalizePostgresMessage(row);

          appendMessage({
            ...message,
            email:
              message.user_id === currentUserId
                ? currentUserEmail
                : message.email,
          });
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
  }, [currentUserEmail, currentUserId, groupId, supabase]);

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
    <section className="rounded-2xl border bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-neutral-50">
            Group Chat
          </h2>

          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Messages appear in real time for active group members.
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            isConnected
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          }`}
        >
          {isConnected ? "Realtime" : connectionStatus}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="mt-5 h-130 space-y-3 overflow-y-auto rounded-2xl border bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <p className="max-w-sm text-sm text-neutral-600 dark:text-neutral-400">
              No messages yet. Start the group conversation.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const isMine = message.user_id === currentUserId;

            return (
              <article
                key={message.message_id}
                className={`rounded-2xl border p-4 dark:border-neutral-800 ${
                  isMine
                    ? "bg-white dark:bg-neutral-950"
                    : "bg-neutral-100 dark:bg-neutral-800"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
                    {isMine ? "You" : getDisplayName(message)}
                  </p>

                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {new Date(message.created_at).toLocaleString()}
                  </p>
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                  {message.content}
                </p>
              </article>
            );
          })
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-4 flex flex-col gap-3 md:flex-row"
      >
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={2}
          placeholder="Write a message..."
          className="min-h-13 flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
        />

        <button
          type="submit"
          disabled={isPending || !content.trim()}
          className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          {isPending ? "Sending..." : "Send"}
        </button>
      </form>
    </section>
  );
}
