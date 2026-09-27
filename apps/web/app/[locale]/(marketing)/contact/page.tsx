import { ExternalLink, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicPageBody, PublicPageHeader } from "@/components/marketing/public-page";
import { isMarketingLocale } from "@/lib/marketing/locale";
import { contactContent, publicPageSeo } from "@/lib/marketing/public-content";
import { createLocalizedMetadata } from "@/lib/seo/localized-metadata";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();
  return createLocalizedMetadata({ locale, pathname: "/contact", ...publicPageSeo[locale].contact });
}

export default async function ContactPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();
  const content = contactContent[locale];

  return (
    <>
      <PublicPageHeader eyebrow={content.eyebrow} title={content.title} description={content.description} />
      <PublicPageBody>
        <div className="grid gap-px overflow-hidden border-x border-b border-border bg-border md:grid-cols-2">
          <section className="bg-background p-8">
            <ExternalLink className="size-5 text-primary" aria-hidden="true" />
            <h2 className="mt-5 text-[21px] font-semibold">{content.issueTitle}</h2>
            <p className="mt-3 text-[14px] leading-7 text-secondary">{content.issueDescription}</p>
            <a href="https://github.com/Horus031/lumivox/issues" target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground">
              {content.issueCta}<ExternalLink className="size-3.5" />
            </a>
          </section>
          <section className="bg-background p-8">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            <h2 className="mt-5 text-[21px] font-semibold">{content.privacyTitle}</h2>
            <p className="mt-3 text-[14px] leading-7 text-secondary">{content.privacyDescription}</p>
          </section>
        </div>
        <section className="border-x border-b border-border p-8">
          <h2 className="text-[21px] font-semibold">{content.responseTitle}</h2>
          <ul className="mt-5 grid gap-3 text-[14px] text-secondary sm:grid-cols-2">
            {content.responseItems.map((item) => <li key={item} className="border-l-2 border-primary pl-3">{item}</li>)}
          </ul>
        </section>
      </PublicPageBody>
    </>
  );
}
