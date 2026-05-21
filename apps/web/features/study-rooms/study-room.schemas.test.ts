import { describe, expect, it } from "vitest";

import {
  createStudyRoomSchema,
  joinPrivateRoomSchema,
} from "./study-room.schemas";

describe("study room schemas", () => {
  it("accepts a valid room creation payload", () => {
    const result = createStudyRoomSchema.safeParse({
      title: "Final Project Focus Room",
      description: "A room for thesis work.",
      visibility: "private",
      maxParticipants: 20,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a room title that is too short", () => {
    const result = createStudyRoomSchema.safeParse({
      title: "Hi",
      description: "",
      visibility: "public",
      maxParticipants: 20,
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid invite code", () => {
    const result = joinPrivateRoomSchema.safeParse({
      inviteCode: "AB12CD34",
    });

    expect(result.success).toBe(true);
  });
});