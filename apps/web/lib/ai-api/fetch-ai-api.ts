import {
  randomUUID,
} from "node:crypto";


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

    public readonly status:
      number,

    public readonly requestId:
      string,
  ) {
    super(message);

    this.name =
      "AiApiError";
  }
}


const RETRYABLE_STATUSES =
  new Set([
    502,
    503,
    504,
  ]);


function sleep(
  milliseconds: number,
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}


async function readErrorDetail(
  response: Response,
) {
  try {
    const body =
      (await response.json()) as {
        detail?: unknown;
      };

    if (
      typeof body.detail
      === "string"
    ) {
      return body.detail;
    }
  } catch {
    // Fall back below.
  }

  return (
    `AI API request failed `
    + `(${response.status}).`
  );
}


export async function fetchAiApi<
  TResponse
>({
  path,
  body,

  timeoutMs = 30_000,
  retries = 0,

  requestId:
    providedRequestId,
}: FetchAiApiOptions): Promise<TResponse> {
  const apiBaseUrl =
    process.env
      .AI_API_BASE_URL;

  const internalKey =
    process.env
      .AI_INTERNAL_API_KEY;

  if (
    !apiBaseUrl
    || !internalKey
  ) {
    throw new Error(
      "AI backend environment variables "
      + "are not configured correctly.",
    );
  }

  const requestId =
    providedRequestId
    ?? randomUUID();

  const attempts =
    Math.max(
      1,
      retries + 1,
    );

  for (
    let attempt = 0;
    attempt < attempts;
    attempt += 1
  ) {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        timeoutMs,
      );

    try {
      const response =
        await fetch(
          [
            apiBaseUrl.replace(
              /\/$/,
              "",
            ),
            path,
          ].join(""),
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-lumivox-internal-key":
                internalKey,

              "x-lumivox-request-id":
                requestId,
            },

            body:
              JSON.stringify(
                body,
              ),

            cache:
              "no-store",

            signal:
              controller.signal,
          },
        );

      if (response.ok) {
        return (
          await response.json()
        ) as TResponse;
      }

      const detail =
        await readErrorDetail(
          response,
        );

      const canRetry =
        RETRYABLE_STATUSES.has(
          response.status,
        )
        && attempt + 1
          < attempts;

      if (canRetry) {
        await sleep(
          300
          * (attempt + 1),
        );

        continue;
      }

      throw new AiApiError(
        `${detail} Reference: ${requestId}`,
        response.status,
        requestId,
      );
    } catch (error) {
      if (
        error
        instanceof AiApiError
      ) {
        throw error;
      }

      if (
        attempt + 1
        < attempts
      ) {
        await sleep(
          300
          * (attempt + 1),
        );

        continue;
      }

      if (
        error
        instanceof Error
        && error.name
          === "AbortError"
      ) {
        throw new Error(
          "AI service timed out. "
          + `Reference: ${requestId}`,
        );
      }

      throw new Error(
        "AI service is temporarily "
        + "unavailable. "
        + `Reference: ${requestId}`,
      );
    } finally {
      clearTimeout(
        timeout,
      );
    }
  }

  throw new Error(
    "AI request did not complete."
  );
}