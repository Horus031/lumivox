import { z } from "zod";

export const sendStudyRoomMessageSchema = z.object({
  roomId: z.string().uuid("Invalid room id."),

  content: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(2000, "Message cannot exceed 2000 characters."),
});

export type SendStudyRoomMessageInput = z.infer<
  typeof sendStudyRoomMessageSchema
>;