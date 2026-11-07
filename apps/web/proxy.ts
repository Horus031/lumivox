import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";
import { NextResponse } from "next/server";

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  if (/^\/(en|vi)\/study-reminders\/unsubscribe\/?$/.test(request.nextUrl.pathname)) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  // Capability endpoints authorize in their handlers without a session refresh.
  if (request.nextUrl.pathname === "/api/webhooks/resend/study-reminders" ||
    request.nextUrl.pathname === "/api/study-reminders/unsubscribe" ||
    request.nextUrl.pathname === "/api/internal/study-reminders/dispatch" ||
    request.nextUrl.pathname === "/api/internal/learning-schedule/health") {
    return NextResponse.next();
  }
  if (isUnlocalizedAppRoute(request.nextUrl.pathname)) {
    return await updateSession(request);
  }

  const i18nResponse = handleI18nRouting(request);

  if (i18nResponse.headers.has("location")) {
    return i18nResponse;
  }

  if (isLocalizedLandingRoute(request.nextUrl.pathname)) {
    return i18nResponse;
  }

  return await updateSession(request, i18nResponse);
}

function isUnlocalizedAppRoute(pathname: string) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/robots.txt/") ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/sitemap.xml/") ||
    pathname === "/auth/confirm" ||
    pathname.startsWith("/auth/confirm/") ||
    pathname === "/auth/signout" ||
    pathname.startsWith("/auth/signout/") ||
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    pathname === "/donation" ||
    pathname.startsWith("/donation/")
  );
}

function isLocalizedLandingRoute(pathname: string) {
  const [, maybeLocale, ...segments] = pathname.split("/");

  return (
    routing.locales.some((locale) => locale === maybeLocale) &&
    segments.length === 0
  );
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - public/static files with extensions, e.g. images, videos, fonts, robots.txt
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|.*\\..*).*)",
    "/",
  ],
};
