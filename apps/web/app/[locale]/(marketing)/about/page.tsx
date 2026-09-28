import {
  ContentSection,
  PublicPageBody,
  PublicPageHeader,
} from "@/components/marketing/public-page";
import { Link } from "@/i18n/navigation";
import { isMarketingLocale } from "@/lib/marketing/locale";
import { aboutContent, publicPageSeo } from "@/lib/marketing/public-content";
import { createLocalizedMetadata } from "@/lib/seo/localized-metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();
  return createLocalizedMetadata({ locale, pathname: "/about", ...publicPageSeo[locale].about });
}

export default async function AboutPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();
  const content = aboutContent[locale];

  return (
    <>
      <PublicPageHeader {...content} />
      <PublicPageBody>
        {content.sections.map((section, index) => (
          <ContentSection key={section.title} number={String(index + 1).padStart(2, "0")} title={section.title}>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </ContentSection>
        ))}
        <div className="flex flex-wrap gap-3 pt-10">
          <Link href="/features" className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground">
            {locale === "en" ? "Explore Lumivox study features" : "Khám phá tính năng học tập Lumivox"}
          </Link>
          <Link href="/research" className="rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium">
            {locale === "en" ? "Read the task-delay model evaluation" : "Đọc đánh giá mô hình dự đoán trễ nhiệm vụ"}
          </Link>
        </div>
      </PublicPageBody>
    </>
  );
}
