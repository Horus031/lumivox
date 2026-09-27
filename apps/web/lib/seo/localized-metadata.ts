import type { Metadata } from "next";

import { siteConfig } from "./site-config";

type Locale = "en" | "vi";

type LanguagePaths = Record<Locale, string>;

type ArticleMetadata = {
  publishedTime: string;
  modifiedTime: string;
  authors: string[];
};

type LocalizedMetadataInput = {
  locale: Locale;
  pathname: string;
  title: string;
  description: string;
  languagePaths?: LanguagePaths;
  image?: string;
  imageAlt?: string;
  article?: ArticleMetadata;
};

export function createLocalizedMetadata({
  locale,
  pathname,
  title,
  description,
  languagePaths,
  image,
  imageAlt,
  article,
}: LocalizedMetadataInput): Metadata {
  const localizedPath = `/${locale}${pathname}`;
  const languages = languagePaths ?? {
    en: `/en${pathname}`,
    vi: `/vi${pathname}`,
  };

  const sharedOpenGraph = {
    url: localizedPath,
    siteName: siteConfig.name,
    title: `${title} | ${siteConfig.name}`,
    description,
    locale: locale === "en" ? "en_US" : "vi_VN",
    alternateLocale: locale === "en" ? ["vi_VN"] : ["en_US"],
    images: image ? [{ url: image, alt: imageAlt ?? title }] : undefined,
  } as const;

  return {
    title,
    description,

    alternates: {
      canonical: localizedPath,

      languages: {
        ...languages,
        "x-default": languages.en,
      },
    },

    openGraph: article
      ? {
          type: "article",
          ...sharedOpenGraph,
          publishedTime: article.publishedTime,
          modifiedTime: article.modifiedTime,
          authors: article.authors,
        }
      : { type: "website", ...sharedOpenGraph },

    twitter: {
      card: "summary_large_image",
      title: `${title} | ${siteConfig.name}`,
      description,
      images: image ? [image] : undefined,
    },
  };
}
