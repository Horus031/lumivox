import { checkRateLimit } from "@vercel/firewall";
import { getVercelOidcToken } from "@vercel/oidc";
import { handleIngress } from "../../handler";
import { consumeThroughBridge } from "../../bridge";

export default function unsubscribe(request: Request) {
  return handleIngress(request, {
    async isRateLimited(request) {
      const id = process.env.UNSUBSCRIBE_INGRESS_RATE_LIMIT_ID;
      if (!id) throw new Error("Missing rate limit configuration");
      const result = await checkRateLimit(id, { request, timeout: 1000 });
      if (result.error === "blocked") return true;
      if (result.error) throw new Error("Rate limit unavailable");
      return result.rateLimited;
    },
    consume: (hash) => consumeThroughBridge(hash, process.env, getVercelOidcToken),
  });
}
