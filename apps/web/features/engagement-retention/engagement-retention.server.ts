"use server";

type RecalculateEngagementApiResponse = {
  stats: {
    current_streak_days: number;
    longest_streak_days: number;
    streak_status: "active" | "frozen" | "lost";
    token_balance: number;
  };
};

export async function recalculateEngagementForUser(
  userId: string
): Promise<RecalculateEngagementApiResponse> {
  const apiBaseUrl = process.env.AI_API_BASE_URL;
  const internalKey = process.env.AI_INTERNAL_API_KEY;

  if (!apiBaseUrl || !internalKey) {
    throw new Error(
      "AI backend environment variables are not configured correctly."
    );
  }

  const response = await fetch(
    `${apiBaseUrl.replace(/\/$/, "")}/api/v1/engagement/recalculate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-lumivox-internal-key": internalKey,
      },
      body: JSON.stringify({
        user_id: userId,
        persist_results: true,
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `Engagement recalculation failed (${response.status}): ${errorBody}`
    );
  }

  return (await response.json()) as RecalculateEngagementApiResponse;
}