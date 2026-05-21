"use server";

import type { ActionResult } from "@/lib/actions/action-result";
import { requireUser } from "@/lib/auth/require-user";

import {
  sendStudyRoomMessageSchema,
  type SendStudyRoomMessageInput,
} from "@/features/study-room-chat/study-room-chat.schemas";

export async function sendStudyRoomMessageAction(
  input: SendStudyRoomMessageInput
): Promise<ActionResult<{ messageId: string }>> {
  const parsed = sendStudyRoomMessageSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid message payload.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase, user } = await requireUser();

    const { data, error } = await supabase
      .from("study_room_messages")
      .insert({
        room_id: parsed.data.roomId,
        sender_id: user.id,
        content: parsed.data.content,
      })
      .select("id")
      .single();

    if (error) {
      return {
        success: false,
        message: `Failed to send message: ${error.message}`,
      };
    }

    return {
      success: true,
      message: "Message sent.",
      data: {
        messageId: data.id,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while sending the message.",
    };
  }
}