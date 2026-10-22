import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { PageLoading } from "@/features/app-shell/components/page-loading";
import type { ReactNode } from "react";
import type { Metadata } from "next";

import { redirectToOnboardingIfNeeded } from "@/lib/auth/onboarding-guard";
import { ProtectedAppShell } from "@/features/app-shell/components/protected-app-shell";

type ProtectedLayoutProps = {
  children: ReactNode;
};

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ProtectedLayout({
  children,
}: ProtectedLayoutProps) {
  return (
    <Suspense fallback={<ProtectedLayoutFallback />}>
      <ProtectedLayoutContent>{children}</ProtectedLayoutContent>
    </Suspense>
  );
}

async function ProtectedLayoutContent({ children }: ProtectedLayoutProps) {
  const profile = await redirectToOnboardingIfNeeded();

  return <ProtectedAppShell profile={profile}>{children}</ProtectedAppShell>;
}

function ProtectedLayoutFallback() {
  const t = useTranslations("common");
  return (
    <div className="min-h-svh bg-background text-foreground">
      <div aria-hidden="true" className="h-topbar border-b border-border" />
      <div className="lg:pl-sidebar"><div className="min-w-0 px-card py-page md:px-page"><PageLoading label={t("loading")} /></div></div>
    </div>
  );
}
