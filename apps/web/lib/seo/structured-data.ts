import { siteConfig } from "@/lib/seo/site-config";

const organizationId = `${siteConfig.url}/#organization`;
const websiteId = `${siteConfig.url}/#website`;
const applicationId = `${siteConfig.url}/#application`;

const localizedStructuredData = {
  en: {
    description:
      "Lumivox is an AI study planner for students that combines task planning, focus sessions, behavioral analytics, and personalized AI-assisted recommendations in one workspace.",
  },

  vi: {
    description:
      "Lumivox là ứng dụng học tập AI cho sinh viên, kết hợp lập kế hoạch nhiệm vụ, phiên tập trung, phân tích hành vi và gợi ý học tập cá nhân hóa trong một không gian duy nhất.",
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