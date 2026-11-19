"use client";
import { usePathname } from "next/navigation";
import { GoogleAnalytics } from "@next/third-parties/google";

/** Email links enter by full document navigation. Never mount Analytics on a
 * capability landing page, including the initial server render. Do not add SPA
 * links to these URLs: an already-loaded analytics script cannot be recalled. */
export function PrivacyAwareAnalytics({ gaId }: { gaId: string }) {
  const pathname = usePathname();
  if (!pathname || /^\/(en|vi)\/study-reminders\/unsubscribe\/?$/.test(pathname)) return null;
  return <GoogleAnalytics gaId={gaId} />;
}
