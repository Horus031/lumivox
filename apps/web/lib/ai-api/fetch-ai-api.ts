type FetchAiApiOptions = {
  path: string;
  body: unknown;
};

export async function fetchAiApi<TResponse>({
  path,
  body,
}: FetchAiApiOptions): Promise<TResponse> {
  const apiBaseUrl = process.env.AI_API_BASE_URL;
  const internalKey = process.env.AI_INTERNAL_API_KEY;

  if (!apiBaseUrl || !internalKey) {
    throw new Error(
      "AI backend environment variables are not configured correctly."
    );
  }

  const response = await fetch(
    `${apiBaseUrl.replace(/\/$/, "")}${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-lumivox-internal-key": internalKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `AI API request failed (${response.status}): ${errorBody}`
    );
  }

  return (await response.json()) as TResponse;
}