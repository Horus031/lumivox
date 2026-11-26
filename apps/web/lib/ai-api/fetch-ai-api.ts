import { randomUUID } from "node:crypto";

type FetchAiApiOptions = {
  path: string;
  body: unknown;

  timeoutMs?: number;
  retries?: number;

  requestId?: string;
};

export class AiApiError extends Error {
  constructor(
    message: string,

    public readonly status: number,

    public readonly requestId: string,

    public readonly code?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);

    this.name = "AiApiError";
  }
}

export class AiApiTransportError extends Error {
  constructor(
    message: string,
    public readonly requestId: string,
    public readonly code: "AI_API_TIMEOUT" | "AI_API_UNAVAILABLE",
  ) {
    super(message);
    this.name = "AiApiTransportError";
  }
}

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function readErrorDetail(response: Response) {
  try {
    const body = (await response.json()) as {
      detail?: unknown;
    };

    if (typeof body.detail === "string") {
      return {
        message: body.detail,
        code: /^[A-Z][A-Z0-9_]*$/.test(body.detail) ? body.detail : undefined,
      };
    }

    if (body.detail && typeof body.detail === "object" && !Array.isArray(body.detail)) {
      const details = body.detail as Record<string, unknown>;
      return {
        message: typeof details.message === "string"
          ? details.message
          : `AI API request failed (${response.status}).`,
        code: typeof details.code === "string" ? details.code : undefined,
        details,
      };
    }
  } catch {
    // Fall back below.
  }

  return { message: `AI API request failed (${response.status}).` };
}

export async function fetchAiApi<TResponse>({
  path,
  body,

  timeoutMs = 30_000,
  retries = 0,

  requestId: providedRequestId,
}: FetchAiApiOptions): Promise<TResponse> {
  const apiBaseUrl = process.env.AI_API_BASE_URL;

  const internalKey = process.env.AI_INTERNAL_API_KEY;

  if (!apiBaseUrl || !internalKey) {
    throw new Error("AI backend environment variables " + "are not configured correctly.");
  }

  const requestId = providedRequestId ?? randomUUID();

  const attempts = Math.max(1, retries + 1);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch([apiBaseUrl.replace(/\/$/, ""), path].join(""), {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          "x-lumivox-internal-key": internalKey,

          "x-lumivox-request-id": requestId,
        },

        body: JSON.stringify(body),

        cache: "no-store",

        signal: controller.signal,
      });

      if (response.ok) {
        return (await response.json()) as TResponse;
      }

      const detail = await readErrorDetail(response);

      const canRetry = RETRYABLE_STATUSES.has(response.status) && attempt + 1 < attempts;

      if (canRetry) {
        await sleep(300 * (attempt + 1));

        continue;
      }

      throw new AiApiError(
        `${detail.message} Reference: ${requestId}`,
        response.status,
        requestId,
        detail.code,
        detail.details,
      );
    } catch (error) {
      if (error instanceof AiApiError) {
        throw error;
      }

      if (attempt + 1 < attempts) {
        await sleep(300 * (attempt + 1));

        continue;
      }

      if (
        controller.signal.aborted ||
        (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")
      ) {
        throw new AiApiTransportError(
          `AI service timed out. Reference: ${requestId}`,
          requestId,
          "AI_API_TIMEOUT",
        );
      }

      throw new AiApiTransportError(
        `AI service is temporarily unavailable. Reference: ${requestId}`,
        requestId,
        "AI_API_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("AI request did not complete.");
}
