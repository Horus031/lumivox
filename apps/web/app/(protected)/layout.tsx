import { Suspense } from "react";
import type { ReactNode } from "react";

import { redirectToOnboardingIfNeeded } from "@/lib/auth/onboarding-guard";
import { ProtectedAppShell } from "@/features/app-shell/components/protected-app-shell";

type ProtectedLayoutProps = {
  children: ReactNode;
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

async function ProtectedLayoutContent({
  children,
}: ProtectedLayoutProps) {
  const profile = await redirectToOnboardingIfNeeded();

  return (
    <ProtectedAppShell profile={profile}>
      {children}
    </ProtectedAppShell>
  );
}

function ProtectedLayoutFallback() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="px-4 py-6 md:px-6 lg:px-8 lg:py-8 xl:px-4 xl:py-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <div className="h-28 animate-pulse rounded-[28px] border border-border/70 bg-card/70" />
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-6">
              <div className="h-36 animate-pulse rounded-[28px] border border-border/70 bg-card/70" />
              <div className="h-72 animate-pulse rounded-[28px] border border-border/70 bg-card/70" />
              <div className="h-80 animate-pulse rounded-[28px] border border-border/70 bg-card/70" />
            </div>
            <div className="space-y-6">
              <div className="h-60 animate-pulse rounded-[28px] border border-border/70 bg-card/70" />
              <div className="h-72 animate-pulse rounded-[28px] border border-border/70 bg-card/70" />
              <div className="h-64 animate-pulse rounded-[28px] border border-border/70 bg-card/70" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}