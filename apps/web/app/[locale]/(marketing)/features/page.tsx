import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicPageBody, PublicPageHeader } from "@/components/marketing/public-page";
import { Link } from "@/i18n/navigation";
import { isMarketingLocale } from "@/lib/marketing/locale";
import { featureContent, publicPageSeo } from "@/lib/marketing/public-content";
import { createLocalizedMetadata } from "@/lib/seo/localized-metadata";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();
  return createLocalizedMetadata({ locale, pathname: "/features", ...publicPageSeo[locale].features });
}

export default async function FeaturesPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();
  const content = featureContent[locale];

  return (
    <>
      <PublicPageHeader {...content} />
      <PublicPageBody>
        <div className="grid gap-px overflow-hidden border-x border-b border-border bg-border md:grid-cols-2">
          {content.items.map(([title, description], index) => (
            <article key={title} className="bg-background p-7 md:p-9">
              <div className="flex items-center justify-between">
                <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
                <span className="font-mono text-[11px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <h2 className="mt-5 text-[20px] font-semibold tracking-tight">{title}</h2>
              <p className="mt-3 text-[14px] leading-7 text-secondary">{description}</p>
            </article>
          ))}
        </div>
        <p className="pt-10 text-[14px] text-secondary">
          {locale === "en" ? "See how the task-risk capability is evaluated in " : "Xem cách năng lực dự đoán rủi ro nhiệm vụ được đánh giá tại "}
          <Link href="/research" className="font-medium text-primary underline underline-offset-4">
            {locale === "en" ? "Research & Evaluation" : "Nghiên cứu & đánh giá"}
          </Link>.
        </p>
      </PublicPageBody>
    </>
  );
}
