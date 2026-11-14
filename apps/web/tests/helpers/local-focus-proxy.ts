import { createServer } from "node:http";

type LaunchObserver = (
  request: Record<string, unknown>,
  response: Record<string, unknown>,
) => boolean | "disconnect";

export async function startLocalFocusProxy(
  backend: string,
  port: string,
  withholdLaunch?: LaunchObserver,
  observeTransition?: (status: number) => void,
) {
  const origin = new URL(backend);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1")
    throw new Error("Focus proxy requires a loopback FastAPI");
  const proxy = createServer(async (request, response) => {
    try {
      if (!request.url?.startsWith("/api/v1/focus-v2/")) {
        response.writeHead(404).end();
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString("utf8");
      const upstream = await fetch(new URL(request.url, origin), {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          "x-lumivox-internal-key": String(request.headers["x-lumivox-internal-key"] ?? ""),
        },
      });
      const payload = await upstream.text();
      // Observe an upstream commit before optionally withholding the response.
      if (upstream.ok && request.url.endsWith("/create-from-study-session")) {
        const fault = withholdLaunch?.(JSON.parse(body), JSON.parse(payload));
        if (fault === "disconnect") response.destroy();
        if (fault) return;
      }
      if (request.url.endsWith("/transition")) observeTransition?.(upstream.status);
      response.writeHead(upstream.status, { "content-type": "application/json" }).end(payload);
    } catch {
      response.writeHead(502).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    proxy.once("error", reject).listen(Number(port), "127.0.0.1", resolve);
  });
  return () =>
    new Promise<void>((resolve, reject) => {
      proxy.close((error) => (error ? reject(error) : resolve()));
      proxy.closeAllConnections();
    });
}
