import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";
import { blogPosts } from "@/lib/blog/posts";
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
    "/blog",
  ] as const;

  const publicPages = publicRoutes.flatMap((pathname) =>
    routing.locales.map((locale) => ({
      url: `${siteConfig.url}/${locale}${pathname}`,
    })),
  );

  const articles = blogPosts.map((post) => ({
    url: `${siteConfig.url}/${post.locale}/blog/${post.slug}`,
    lastModified: post.modifiedAt,
  }));

  return [...publicPages, ...articles];
}
