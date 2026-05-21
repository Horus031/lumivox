"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";

import {
  createStudyRoomSchema,
  joinPrivateRoomSchema,
  joinPublicRoomSchema,
  roomIdSchema,
  type CreateStudyRoomInput,
} from "./study-room.schemas";

export async function createStudyRoomAction(
  input: CreateStudyRoomInput,
): Promise<ActionResult<{ roomId: string }>> {
  const parsed = createStudyRoomSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid study room data.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase } = await requireUser();

    const { data, error } = await supabase.rpc("create_study_room", {
      p_title: parsed.data.title,
      p_description: parsed.data.description || undefined,
      p_visibility: parsed.data.visibility,
      p_max_participants: parsed.data.maxParticipants,
    });

    if (error) {
      return {
        success: false,
        message: `Failed to create study room: ${error.message}`,
      };
    }

    revalidatePath("/rooms");

    return {
      success: true,
      message: "Study room created successfully.",
      data: {
        roomId: data,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while creating the study room.",
    };
  }
}

export async function joinPublicStudyRoomAction(
  roomId: string,
): Promise<ActionResult<{ roomId: string }>> {
  const parsed = joinPublicRoomSchema.safeParse({ roomId });

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid room id.",
    };
  }

  try {
    const { supabase } = await requireUser();

    const { data, error } = await supabase.rpc("join_study_room", {
      p_room_id: parsed.data.roomId,
      p_invite_code: undefined,
    });

    if (error) {
      return {
        success: false,
        message: `Failed to join study room: ${error.message}`,
      };
    }

    revalidatePath("/rooms");

    return {
      success: true,
      message: "Joined study room successfully.",
      data: {
        roomId: data,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while joining the study room.",
    };
  }
}

export async function joinPrivateStudyRoomByCodeAction(
  inviteCode: string,
): Promise<ActionResult<{ roomId: string }>> {
  const parsed = joinPrivateRoomSchema.safeParse({ inviteCode });

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid invite code.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase } = await requireUser();

    const { data, error } = await supabase.rpc("join_study_room_by_code", {
      p_invite_code: parsed.data.inviteCode,
    });

    if (error) {
      return {
        success: false,
        message: `Failed to join private room: ${error.message}`,
      };
    }

    revalidatePath("/rooms");

    return {
      success: true,
      message: "Joined private study room successfully.",
      data: {
        roomId: data,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while joining the private room.",
    };
  }
}

export async function leaveStudyRoomAction(
  roomId: string,
): Promise<ActionResult> {
  const parsed = roomIdSchema.safeParse({ roomId });

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid room id.",
    };
  }

  try {
    const { supabase } = await requireUser();

    const { error } = await supabase.rpc("leave_study_room", {
      p_room_id: parsed.data.roomId,
    });

    if (error) {
      return {
        success: false,
        message: `Failed to leave study room: ${error.message}`,
      };
    }

    revalidatePath("/rooms");

    return {
      success: true,
      message: "You left the study room.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while leaving the study room.",
    };
  }
}
