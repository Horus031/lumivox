import { siteConfig } from "@/lib/seo/site-config";

const organizationId = `${siteConfig.url}/#organization`;
const websiteId = `${siteConfig.url}/#website`;
const applicationId = `${siteConfig.url}/#application`;

const localizedStructuredData = {
  en: {
    description:
      "Lumivox is an AI-powered study and productivity platform that helps students plan tasks, improve focus, understand learning habits, and receive personalized learning recommendations.",
  },

  vi: {
    description:
      "Lumivox là nền tảng học tập và năng suất tích hợp AI giúp sinh viên quản lý nhiệm vụ, cải thiện khả năng tập trung, phân tích thói quen học tập và nhận gợi ý cá nhân hóa.",
  },
} as const;

export type SeoLocale = keyof typeof localizedStructuredData;

export function getLandingStructuredData(locale: SeoLocale) {
  const localized = localizedStructuredData[locale];

  return {
    "@context": "https://schema.org",

    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: siteConfig.name,
        url: siteConfig.url,
        logo: `${siteConfig.url}/logo.png`,
        description: siteConfig.defaultDescription,
      },

      {
        "@type": "WebSite",
        "@id": websiteId,
        name: siteConfig.name,
        url: `${siteConfig.url}/`,
        publisher: {
          "@id": organizationId,
        },
        inLanguage: ["en", "vi"],
      },

      {
        "@type": "WebApplication",
        "@id": applicationId,
        name: siteConfig.name,
        url: `${siteConfig.url}/${locale}`,
        description: localized.description,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        isAccessibleForFree: true,
        offers: {
          "@type": "Offer",
          price: 0,
          priceCurrency: "USD",
        },
        publisher: {
          "@id": organizationId,
        },
        inLanguage: locale,
      },
    ],
  };
}