import type { Metadata } from "next";

import { siteConfig } from "./site-config";

type Locale = "en" | "vi";

type LocalizedMetadataInput = {
  locale: Locale;
  pathname: string;
  title: string;
  description: string;
};

export function createLocalizedMetadata({
  locale,
  pathname,
  title,
  description,
}: LocalizedMetadataInput): Metadata {
  const localizedPath = `/${locale}${pathname}`;

  return {
    title,
    description,

    alternates: {
      canonical: localizedPath,

      languages: {
        en: `/en${pathname}`,
        vi: `/vi${pathname}`,
        "x-default": `/en${pathname}`,
      },
    },

    openGraph: {
      type: "website",
      url: localizedPath,
      siteName: siteConfig.name,
      title: `${title} | ${siteConfig.name}`,
      description,
      locale: locale === "en" ? "en_US" : "vi_VN",
      alternateLocale:
        locale === "en" ? ["vi_VN"] : ["en_US"],
    },

    twitter: {
      card: "summary_large_image",
      title: `${title} | ${siteConfig.name}`,
      description,
    },
  };
}