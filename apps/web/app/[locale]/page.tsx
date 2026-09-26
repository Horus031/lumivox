import CTA from "@/components/landing/cta";
import FAQ from "@/components/landing/faq";
import Features from "@/components/landing/features";
import Footer from "@/components/landing/footer";
import Hero from "@/components/landing/hero";
import HowItWorks from "@/components/landing/how-it-works";
import NavBar from "@/components/landing/navbar";
import Pricing from "@/components/landing/pricing";
import Showcase from "@/components/landing/showcase";
import Stats from "@/components/landing/stats";
import Testimonials from "@/components/landing/testimonials";

import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";
import { siteConfig } from "@/lib/seo/site-config";

type LandingPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

const landingSeo = {
  en: {
    title: "AI Study Planner & Focus Analytics",

    fullTitle:
      "Lumivox – AI Study Planner & Focus Analytics",

    description:
      "Plan tasks, improve focus, understand your study habits, and get personalized AI learning recommendations with Lumivox.",

    openGraphLocale: "en_US",
  },

  vi: {
    title: "Ứng dụng học tập AI & quản lý tập trung",

    fullTitle:
      "Lumivox – Ứng dụng học tập AI & quản lý tập trung",

    description:
      "Lumivox giúp sinh viên quản lý nhiệm vụ, tập trung học tập, phân tích thói quen và nhận gợi ý học tập cá nhân hóa từ AI.",

    openGraphLocale: "vi_VN",
  },
} as const;

export async function generateMetadata({
  params,
}: LandingPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const seo = landingSeo[locale];

  return {
    title: seo.title,

    description: seo.description,

    alternates: {
      canonical: `/${locale}`,

      languages: {
        en: "/en",
        vi: "/vi",
        "x-default": "/en",
      },
    },

    openGraph: {
      type: "website",

      url: `/${locale}`,

      siteName: siteConfig.name,

      title: seo.fullTitle,

      description: seo.description,

      locale: seo.openGraphLocale,

      alternateLocale:
        locale === "en"
          ? ["vi_VN"]
          : ["en_US"],
    },

    twitter: {
      card: "summary_large_image",

      title: seo.fullTitle,

      description: seo.description,
    },
  };
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <NavBar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Showcase />
        <Stats />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
