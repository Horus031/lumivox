import type { Profile } from "@/features/profiles/profile.types";
import { SignOutButton } from "@/features/app-shell/components/sign-out-button";

type MobileAppHeaderProps = {
  profile: Profile;
};

export function MobileAppHeader({
  profile,
}: MobileAppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 px-4 py-3 backdrop-blur-xl lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Lumivox
          </p>
          <p className="max-w-45 truncate text-sm font-semibold text-foreground">
            {profile.full_name ?? "Lumivox User"}
          </p>
        </div>

        <div className="w-auto min-w-24">
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}