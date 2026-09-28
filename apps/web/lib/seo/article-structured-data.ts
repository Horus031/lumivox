import type { BlogPost } from "@/lib/blog/posts";

import { siteConfig } from "./site-config";

export function createArticleStructuredData(post: BlogPost) {
  const articleUrl = `${siteConfig.url}/${post.locale}/blog/${post.slug}`;
  const blogUrl = `${siteConfig.url}/${post.locale}/blog`;
  const homeUrl = `${siteConfig.url}/${post.locale}`;
  const labels =
    post.locale === "en"
      ? { home: "Home", blog: "Blog" }
      : { home: "Trang chủ", blog: "Blog" };

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${articleUrl}#article`,
        headline: post.title,
        description: post.description,
        image: [`${siteConfig.url}${post.image}`],
        datePublished: post.publishedAt,
        dateModified: post.modifiedAt,
        inLanguage: post.locale,
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": articleUrl,
        },
        author: {
          "@type": "Organization",
          name: siteConfig.name,
          url: `${siteConfig.url}/${post.locale}/about`,
        },
        publisher: {
          "@id": `${siteConfig.url}/#organization`,
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${articleUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: labels.home,
            item: homeUrl,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: labels.blog,
            item: blogUrl,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: post.title,
            item: articleUrl,
          },
        ],
      },
    ],
  };
}
