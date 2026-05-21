import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { createClient } from "@/lib/supabase/server";

type VoiceTokenRequestBody = {
  roomId?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VoiceTokenRequestBody;
    const roomId = body.roomId;

    if (!roomId || !isUuid(roomId)) {
      return NextResponse.json(
        {
          message: "Invalid room id.",
        },
        {
          status: 400,
        },
      );
    }

    const livekitUrl = process.env.LIVEKIT_URL;
    const livekitApiKey = process.env.LIVEKIT_API_KEY;
    const livekitApiSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
      return NextResponse.json(
        {
          message: "LiveKit environment variables are not configured.",
        },
        {
          status: 500,
        },
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          message: "Authentication required.",
        },
        {
          status: 401,
        },
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from("study_room_members")
      .select("room_id, user_id, membership_status")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .eq("membership_status", "active")
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json(
        {
          message: `Failed to verify room membership: ${membershipError.message}`,
        },
        {
          status: 500,
        },
      );
    }

    if (!membership) {
      return NextResponse.json(
        {
          message: "You are not an active member of this study room.",
        },
        {
          status: 403,
        },
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const participantDisplayName = profile?.full_name ?? "Lumivox User";

    const livekitRoomName = `study-room-voice-${roomId}`;

    const token = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      name: participantDisplayName,
      ttl: "1h",
      metadata: JSON.stringify({
        lumivoxStudyRoomId: roomId,
      }),
    });

    token.addGrant({
      roomJoin: true,
      room: livekitRoomName,
      canPublish: true,
      canSubscribe: true,
    });

    const participantToken = await token.toJwt();

    return NextResponse.json(
      {
        server_url: livekitUrl,
        participant_token: participantToken,
        livekit_room_name: livekitRoomName,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unexpected error while creating LiveKit voice token.",
      },
      {
        status: 500,
      },
    );
  }
}
