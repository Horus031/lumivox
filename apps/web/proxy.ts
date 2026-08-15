import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
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
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/",
    "/(en|vi)/:path*",
  ],
};
