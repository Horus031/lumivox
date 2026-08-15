"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import { getCurrentWeekRange } from "@/features/study-groups/study-group-date.utils";

const createStudyGroupSchema = z.object({
  title: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
});

const inviteStudyGroupMemberSchema = z.object({
  groupId: z.string().uuid(),
  email: z.string().email(),
});

const upsertWeeklyChallengeSchema = z.object({
  groupId: z.string().uuid(),
  title: z.string().min(2).max(120),
  targetFocusMinutes: z.coerce.number().int().min(0).max(10000),
  targetCompletedTasks: z.coerce.number().int().min(0).max(1000),
});

export async function createStudyGroupAction(
  input: z.infer<typeof createStudyGroupSchema>,
): Promise<ActionResult<{ groupId: string }>> {
  try {
    const { supabase, user } = await requireUser();

    const parsed = createStudyGroupSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid group input.",
      };
    }

    const { title, description } = parsed.data;

    const { data: group, error: groupError } = await supabase
      .from("study_rooms")
      .insert({
        title,
        description: description ?? null,
        room_type: "group",
        is_private: true,
        owner_id: user.id,
      })
      .select("id")
      .single();

    if (groupError) {
      return {
        success: false,
        message: `Failed to create study group: ${groupError.message}`,
      };
    }

    const { error: memberError } = await supabase
      .from("study_room_members")
      .insert({
        room_id: group.id,
        user_id: user.id,
        role: "owner",
        membership_status: "active",
      });

    if (memberError) {
      await supabase
        .from("study_rooms")
        .delete()
        .eq("id", group.id)
        .eq("owner_id", user.id);

      return {
        success: false,
        message: `Group created, but failed to add owner membership: ${memberError.message}`,
      };
    }

    revalidatePath("/groups");
    revalidatePath("/", "layout");

    return {
      success: true,
      message: "Study group created successfully.",
      data: {
        groupId: group.id,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while creating study group.",
    };
  }
}

export async function inviteStudyGroupMemberAction(
  input: z.infer<typeof inviteStudyGroupMemberSchema>,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const parsed = inviteStudyGroupMemberSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid invite input.",
      };
    }

    const { groupId, email } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const { data: currentMember, error: currentMemberError } = await supabase
      .from("study_room_members")
      .select("id,role,membership_status")
      .eq("room_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (currentMemberError) {
      return {
        success: false,
        message: `Failed to verify group permission: ${currentMemberError.message}`,
      };
    }

    if (
      !currentMember ||
      currentMember.membership_status !== "active" ||
      !["owner", "admin"].includes(currentMember.role)
    ) {
      return {
        success: false,
        message: "Only group owners or admins can invite members.",
      };
    }

    const { data: targetUserId, error: findUserError } = await supabase.rpc(
      "find_user_id_by_auth_email",
      {
        p_email: normalizedEmail,
      },
    );

    if (findUserError) {
      return {
        success: false,
        message: `Failed to find user by email: ${findUserError.message}`,
      };
    }

    if (!targetUserId) {
      return {
        success: false,
        message:
          "No Lumivox account was found with this email. Ask them to sign up first.",
      };
    }

    const { error: insertError } = await supabase
      .from("study_room_members")
      .upsert(
        {
          room_id: groupId,
          user_id: targetUserId,
          role: "member",
          membership_status: "active",
        },
        {
          onConflict: "room_id,user_id",
        },
      );

    if (insertError) {
      return {
        success: false,
        message: `Failed to invite member: ${insertError.message}`,
      };
    }

    revalidatePath("/groups");
    revalidatePath(`/groups/${groupId}`);

    return {
      success: true,
      message: "Member invited successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while inviting member.",
    };
  }
}

const sendStudyGroupMessageSchema = z.object({
  groupId: z.string().uuid(),
  content: z.string().min(1).max(2000),
});

type SendStudyGroupMessageResult = {
  message_id: string;
  room_id: string;
  user_id: string;
  email: string | null;
  content: string;
  created_at: string;
};

export async function sendStudyGroupMessageAction(
  input: z.infer<typeof sendStudyGroupMessageSchema>,
): Promise<ActionResult<SendStudyGroupMessageResult>> {
  try {
    const { supabase, user } = await requireUser();

    const parsed = sendStudyGroupMessageSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid message.",
      };
    }

    const { groupId, content } = parsed.data;

    const { data: membership, error: membershipError } = await supabase
      .from("study_room_members")
      .select("id,membership_status")
      .eq("room_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      return {
        success: false,
        message: `Failed to verify group membership: ${membershipError.message}`,
      };
    }

    if (!membership || membership.membership_status !== "active") {
      return {
        success: false,
        message: "You are not an active member of this group.",
      };
    }

    const { data: insertedMessage, error: insertError } = await supabase
      .from("study_room_messages")
      .insert({
        room_id: groupId,
        sender_id: user.id,
        content: content.trim(),
      })
      .select("id,room_id,sender_id,content,created_at")
      .single();

    if (insertError) {
      return {
        success: false,
        message: `Failed to send message: ${insertError.message}`,
      };
    }

    return {
      success: true,
      message: "Message sent.",
      data: {
        message_id: insertedMessage.id,
        room_id: insertedMessage.room_id,
        user_id: insertedMessage.sender_id,
        email: user.email ?? null,
        content: insertedMessage.content,
        created_at: insertedMessage.created_at,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while sending message.",
    };
  }
}

export async function upsertStudyGroupWeeklyChallengeAction(
  input: z.infer<typeof upsertWeeklyChallengeSchema>,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const parsed = upsertWeeklyChallengeSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid weekly challenge input.",
      };
    }

    const { groupId, title, targetFocusMinutes, targetCompletedTasks } =
      parsed.data;

    const { data: membership, error: membershipError } = await supabase
      .from("study_room_members")
      .select("id,role,membership_status")
      .eq("room_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      return {
        success: false,
        message: `Failed to verify group permission: ${membershipError.message}`,
      };
    }

    if (
      !membership ||
      membership.membership_status !== "active" ||
      !["owner", "admin", "host"].includes(membership.role)
    ) {
      return {
        success: false,
        message: "Only group managers can update weekly challenges.",
      };
    }

    const { weekStart, weekEnd } = getCurrentWeekRange();

    const { error } = await supabase
      .from("study_group_weekly_challenges")
      .upsert(
        {
          group_id: groupId,
          created_by: user.id,
          week_start: weekStart,
          week_end: weekEnd,
          title,
          target_focus_minutes: targetFocusMinutes,
          target_completed_tasks: targetCompletedTasks,
        },
        {
          onConflict: "group_id,week_start",
        },
      );

    if (error) {
      return {
        success: false,
        message: `Failed to save weekly challenge: ${error.message}`,
      };
    }

    revalidatePath(`/groups/${groupId}`);

    return {
      success: true,
      message: "Weekly challenge saved.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while saving weekly challenge.",
    };
  }
}
