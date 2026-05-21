import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/features/profiles/profile.queries";

export async function redirectToOnboardingIfNeeded() {
  const profile = await getCurrentProfile();

  if (!profile.onboarding_completed) {
    redirect("/onboarding");
  }

  return profile;
}

export async function redirectToDashboardIfOnboardingCompleted() {
  const profile = await getCurrentProfile();

  if (profile.onboarding_completed) {
    redirect("/dashboard");
  }

  return profile;
}