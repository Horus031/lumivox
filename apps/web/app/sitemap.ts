import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";
import {
  isSearchIndexingEnabled,
  siteConfig,
} from "@/lib/seo/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isSearchIndexingEnabled) {
    return [];
  }

  const publicRoutes = [
    "",
    "/about",
    "/features",
    "/research",
    "/privacy",
    "/terms",
    "/contact",
  ] as const;

  return publicRoutes.flatMap((pathname) =>
    routing.locales.map((locale) => ({
      url: `${siteConfig.url}/${locale}${pathname}`,
    })),
  );
}
