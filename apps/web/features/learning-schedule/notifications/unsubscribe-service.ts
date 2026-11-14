import { hashUnsubscribeToken } from "./unsubscribe-capability";

const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
export function unsubscribeGet() {
  // Scanners may GET this URL; never resolve a token or mutate consent.
  return new Response("Unsubscribe requires confirmation by POST.", { status: 200, headers });
}

export async function handleUnsubscribePost(
  request: Request,
  consume: (hash: string) => Promise<boolean>,
): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  const multipart = mediaType === "multipart/form-data";
  if (!multipart && mediaType !== "application/x-www-form-urlencoded")
    return new Response("Invalid request.", { status: 415, headers });
  // A single small form field; do not trust Content-Length for streaming bodies.
  let body: Buffer;
  if (!request.body) return new Response("Invalid request.", { status: 400, headers });
  const reader = request.body.getReader();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 3000);
  try {
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 512) {
        await reader.cancel();
        return new Response("Invalid request.", { status: 413, headers });
      }
      chunks.push(part.value);
    }
    if (timedOut) throw new Error("timeout");
    body = Buffer.concat(chunks);
  } catch {
    return new Response("Invalid request.", { status: 400, headers });
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  let form: FormData | URLSearchParams;
  try {
    form = multipart
      ? await new Response(new Uint8Array(body), {
          headers: { "Content-Type": contentType },
        }).formData()
      : new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return new Response("Invalid request.", { status: 400, headers });
  }
  const url = new URL(request.url);
  const token = url.searchParams.getAll("token");
  const confirmation =
    form.get("locale") === "vi"
      ? "Đã ngừng nhận email nhắc học."
      : "Study reminders have been disabled.";
  // Token is the capability. No cookie, session, Origin or Referer requirement:
  // RFC 8058 mail receivers do not have a browser session.
  if (
    token.length !== 1 ||
    form.getAll("List-Unsubscribe").length !== 1 ||
    form.get("List-Unsubscribe") !== "One-Click" ||
    [...form.entries()].some(
      ([key, value]) => !["List-Unsubscribe", "locale"].includes(key) || typeof value !== "string",
    )
  ) {
    return new Response("Invalid request.", { status: 400, headers });
  }
  const hash = hashUnsubscribeToken(token[0]);
  if (!hash) return new Response("Invalid or unavailable link.", { status: 400, headers });
  try {
    const valid = await consume(hash);
    if (!valid) return new Response("Invalid or unavailable link.", { status: 400, headers });
  } catch {
    return new Response("Please try again later.", { status: 503, headers });
  }
  // No redirect, user identity, account status, email or token in response.
  return new Response(confirmation, { status: 200, headers });
}
