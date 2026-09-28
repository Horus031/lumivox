import type { MarketingLocale } from "./public-content";

export function isMarketingLocale(locale: string): locale is MarketingLocale {
  return locale === "en" || locale === "vi";
}
