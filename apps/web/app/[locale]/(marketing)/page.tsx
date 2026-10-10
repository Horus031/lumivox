import CTA from "@/components/landing/cta";
import EvidenceStrip from "@/components/landing/evidence-strip";
import FAQ from "@/components/landing/faq";
import Features from "@/components/landing/features";
import Hero from "@/components/landing/hero";
import HowItWorks from "@/components/landing/how-it-works";
import ResearchEvidence from "@/components/landing/research-evidence";
import Showcase from "@/components/landing/showcase";
import TrustSection from "@/components/landing/trust-section";
import { JsonLd } from "@/components/seo/json-ld";
import { isMarketingLocale } from "@/lib/marketing/locale";
import { publicPageSeo } from "@/lib/marketing/public-content";
import { createLocalizedMetadata } from "@/lib/seo/localized-metadata";
import { isSearchIndexingEnabled } from "@/lib/seo/site-config";
import { getLandingStructuredData } from "@/lib/seo/structured-data";
import LandingStoryShell from "@/components/landing/story/landing-story-shell";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();

  return createLocalizedMetadata({
    locale,
    pathname: "",
    ...publicPageSeo[locale].home,
  });
}

export default async function LandingPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();

  return (
    <>
      {isSearchIndexingEnabled && (
        <JsonLd data={getLandingStructuredData(locale)} />
      )}

      <LandingStoryShell>
        <Hero />
        <EvidenceStrip />
        <Features />
        <HowItWorks />
        <Showcase />
        <ResearchEvidence />
        <TrustSection />
        <FAQ />
        <CTA />
      </LandingStoryShell>
    </>
  );
}
