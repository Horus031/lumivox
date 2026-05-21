import { describe, expect, it } from "vitest";

import { sendStudyRoomMessageSchema } from "./study-room-chat.schemas";

describe("sendStudyRoomMessageSchema", () => {
  it("accepts a valid room message payload", () => {
    const result = sendStudyRoomMessageSchema.safeParse({
      roomId: "b0888bfe-5763-4cba-88d8-c509c16ea65c",
      content: "Let's study for 30 minutes.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty message", () => {
    const result = sendStudyRoomMessageSchema.safeParse({
      roomId: "b0888bfe-5763-4cba-88d8-c509c16ea65c",
      content: "   ",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid room id", () => {
    const result = sendStudyRoomMessageSchema.safeParse({
      roomId: "invalid-room-id",
      content: "Hello room.",
    });

    expect(result.success).toBe(false);
  });
});