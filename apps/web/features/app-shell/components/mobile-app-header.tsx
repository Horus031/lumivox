import type { Profile } from "@/features/profiles/profile.types";
import { AccountDropdown } from "@/features/app-shell/components/account-dropdown";
import { getTranslations } from "next-intl/server";

type MobileAppHeaderProps = {
  profile: Profile;
};

export async function MobileAppHeader({ profile }: MobileAppHeaderProps) {
  const t = await getTranslations("appShell.sidebar");

  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 px-4 py-3 backdrop-blur-xl lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            {t("eyebrow")}
          </p>
          <p className="max-w-45 truncate text-sm font-semibold text-foreground">
            {profile.full_name ?? t("fallbackUser")}
          </p>
        </div>

        <AccountDropdown profile={profile} compact />
      </div>
    </header>
  );
}
