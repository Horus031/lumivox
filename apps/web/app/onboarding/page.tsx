import { Suspense } from "react";
import type { Metadata } from "next";

import { redirectToDashboardIfOnboardingCompleted } from "@/lib/auth/onboarding-guard";
import { getCurrentProfileWithWeights } from "@/features/profiles/profile.queries";
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { routing } from "@/i18n/routing";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingPageFallback />}>
      <OnboardingPageContent />
    </Suspense>
  );
}

async function OnboardingPageContent() {
  await redirectToDashboardIfOnboardingCompleted();

  const savedLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale = hasLocale(routing.locales, savedLocale) ? savedLocale : routing.defaultLocale;
  const [{ profile, weights }, messages, t] = await Promise.all([
    getCurrentProfileWithWeights(), getMessages({ locale }), getTranslations({ locale, namespace: "onboarding" }),
  ]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main className="min-h-dvh bg-background p-page">
        <div className="mx-auto min-w-0 max-w-3xl space-y-section">
          <PageHeader eyebrow="Lumivox" title={t("title")} description={t("description")} />
          <OnboardingForm profile={profile} weights={weights} />
        </div>
      </main>
    </NextIntlClientProvider>
  );
}

function OnboardingPageFallback() {
  return (
    <main className="min-h-dvh bg-background p-page" aria-busy="true">
      <div className="mx-auto max-w-3xl space-y-section">
        <div className="h-20 animate-pulse rounded-lg bg-muted" />
        <div className="h-112 animate-pulse rounded-lg bg-muted" />
      </div>
    </main>
  );
}
