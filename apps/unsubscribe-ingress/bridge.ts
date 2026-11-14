export async function consumeThroughBridge(
  hash: string,
  env: Readonly<Record<string, string | undefined>>,
  oidc: () => Promise<string>,
  send: typeof fetch = fetch,
): Promise<boolean> {
  const origin = new URL(env.UNSUBSCRIBE_BRIDGE_ORIGIN ?? "");
  const secret = env.UNSUBSCRIBE_BRIDGE_SECRET;
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    !secret ||
    secret.length < 32
  )
    throw new Error("Bridge unavailable");

  const response = await send(new URL("/api/internal/study-reminders/unsubscribe", origin), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "x-lumivox-unsubscribe-hash": hash,
      "x-vercel-trusted-oidc-idp-token": await oidc(),
    },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 204) return true;
  if (response.status === 404) {
    // A platform or routing 404 must not be interpreted as a token decision.
    if (response.headers.get("x-lumivox-unsubscribe-result") === "unavailable") return false;
  }
  throw new Error("Bridge unavailable");
}
