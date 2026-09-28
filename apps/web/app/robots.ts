import type { MetadataRoute } from "next";

import {
  isSearchIndexingEnabled,
  siteConfig,
} from "@/lib/seo/site-config";

export default function robots(): MetadataRoute.Robots {
  const rules: MetadataRoute.Robots["rules"] = {
    userAgent: "*",
    allow: "/",
    disallow: [
      "/api/",
      "/auth/confirm",
      "/auth/signout",
    ],
  };

  if (!isSearchIndexingEnabled) {
    return {
      rules,
    };
  }

  return {
    rules,
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}