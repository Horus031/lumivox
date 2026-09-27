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

  return routing.locales.map((locale) => ({
    url: `${siteConfig.url}/${locale}`,
  }));
}