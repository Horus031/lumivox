import { Suspense } from "react";

import { redirectToDashboardIfOnboardingCompleted } from "@/lib/auth/onboarding-guard";
import { getCurrentProfileWithWeights } from "@/features/profiles/profile.queries";
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form";

export default async function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingPageFallback />}>
      <OnboardingPageContent />
    </Suspense>
  );
}

async function OnboardingPageContent() {
  await redirectToDashboardIfOnboardingCompleted();

  const { profile, weights } = await getCurrentProfileWithWeights();

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Lumivox
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Welcome — let&apos;s calibrate your learning profile
          </h1>

          <p className="mt-2 max-w-3xl text-neutral-600">
            This setup defines your timezone and your Personalized PBI
            weighting. Standard PBI remains fixed for academic consistency;
            Personalized PBI reflects your own emphasis.
          </p>
        </header>

        <OnboardingForm profile={profile} weights={weights} />
      </div>
    </main>
  );
}

function OnboardingPageFallback() {
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="h-28 animate-pulse rounded-[28px] border border-border/70 bg-card/70" />
        <div className="h-[28rem] animate-pulse rounded-[28px] border border-border/70 bg-card/70" />
      </div>
    </main>
  );
}
