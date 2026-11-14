import { randomBytes } from "node:crypto";
import {
  renderReminderEmail,
  type TrustedReminderTemplateContext,
} from "./reminder-email-template";
import { hashUnsubscribeToken } from "./unsubscribe-capability";
export { hashUnsubscribeToken } from "./unsubscribe-capability";
export function generateUnsubscribeToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashUnsubscribeToken(token)! };
}

function trustedOrigin(raw: string) {
  const origin = new URL(raw);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("Invalid trusted origin");
  }
  return origin.origin;
}

/** Internal issuance port; no HTTP endpoint exposes userId/fingerprint/issuance.
 * The caller resolves Auth ownership/current verified email on the server. DB
 * rechecks that exact email under lock; only the hash crosses persistence. */
export async function issueStudyReminderUnsubscribe(
  context: {
    userId: string;
    expectedEmail: string;
    recipientFingerprint: string;
    locale: "en" | "vi";
  },
  origin: string,
  persist: (input: {
    userId: string;
    expectedEmail: string;
    recipientFingerprint: string;
    tokenHash: string;
    replace: boolean;
  }) => Promise<void>,
  replace = false,
) {
  const base = trustedOrigin(origin);
  if (context.locale !== "en" && context.locale !== "vi") throw new Error("Invalid trusted locale");
  const { token, hash } = generateUnsubscribeToken();
  await persist({
    userId: context.userId,
    expectedEmail: context.expectedEmail,
    recipientFingerprint: context.recipientFingerprint,
    tokenHash: hash,
    replace,
  });
  const confirmation = new URL(`/${context.locale}/study-reminders/unsubscribe`, base);
  const oneClick = new URL("/api/study-reminders/unsubscribe", base);
  confirmation.searchParams.set("token", token);
  oneClick.searchParams.set("token", token);
  return { unsubscribeUrl: confirmation.href, oneClickUrl: oneClick.href };
}

/** Future worker integration: token links come from successful trusted issuance,
 * never from browser query input. Pure renderer remains usable for offline QA. */
export async function renderIssuedReminderEmail(
  context: TrustedReminderTemplateContext,
  identity: { userId: string; expectedEmail: string; recipientFingerprint: string },
  origin: string,
  persist: Parameters<typeof issueStudyReminderUnsubscribe>[2],
) {
  const links = await issueStudyReminderUnsubscribe(
    { ...identity, locale: context.locale },
    origin,
    persist,
  );
  return {
    ...renderReminderEmail(context, {
      trustedOrigin: origin,
      unsubscribeUrl: links.unsubscribeUrl,
    }),
    oneClickUrl: links.oneClickUrl,
  };
}
