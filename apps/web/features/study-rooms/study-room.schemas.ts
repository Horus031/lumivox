import { z } from "zod";

export const createStudyRoomSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Room title must contain at least 3 characters.")
    .max(100, "Room title must be at most 100 characters."),

  description: z
    .string()
    .trim()
    .max(500, "Description must be at most 500 characters.")
    .optional()
    .or(z.literal("")),

  visibility: z.enum(["public", "private"]),

  maxParticipants: z.coerce
    .number()
    .int()
    .min(2, "A room must allow at least 2 participants.")
    .max(100, "A room cannot exceed 100 participants."),
});

export const joinPublicRoomSchema = z.object({
  roomId: z.string().uuid("Invalid room id."),
});

export const joinPrivateRoomSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(6, "Invite code is too short.")
    .max(20, "Invite code is too long."),
});

export const roomIdSchema = z.object({
  roomId: z.string().uuid("Invalid room id."),
});

export type CreateStudyRoomInput = z.infer<typeof createStudyRoomSchema>;
export type JoinPublicRoomInput = z.infer<typeof joinPublicRoomSchema>;
export type JoinPrivateRoomInput = z.infer<typeof joinPrivateRoomSchema>;