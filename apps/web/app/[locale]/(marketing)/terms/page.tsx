import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContentSection, PublicPageBody, PublicPageHeader } from "@/components/marketing/public-page";
import { isMarketingLocale } from "@/lib/marketing/locale";
import { publicPageSeo, termsContent } from "@/lib/marketing/public-content";
import { createLocalizedMetadata } from "@/lib/seo/localized-metadata";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();
  return createLocalizedMetadata({ locale, pathname: "/terms", ...publicPageSeo[locale].terms });
}

export default async function TermsPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();
  const content = termsContent[locale];

  return (
    <>
      <PublicPageHeader eyebrow={content.eyebrow} title={content.title} description={content.description}>
        <p className="mt-6 font-mono text-[12px] text-muted-foreground">{content.updated}</p>
      </PublicPageHeader>
      <PublicPageBody>
        {content.sections.map(([title, paragraph], index) => (
          <ContentSection key={title} number={String(index + 1).padStart(2, "0")} title={title}><p>{paragraph}</p></ContentSection>
        ))}
      </PublicPageBody>
    </>
  );
}
