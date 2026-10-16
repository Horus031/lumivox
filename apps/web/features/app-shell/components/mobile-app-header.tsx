import type { Profile } from "@/features/profiles/profile.types";
import { AccountDropdown } from "@/features/app-shell/components/account-dropdown";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/features/theme/theme-switcher";

type MobileAppHeaderProps = {
  profile: Profile;
};

export async function MobileAppHeader({ profile }: MobileAppHeaderProps) {
  const t = await getTranslations("appShell.sidebar");

  return (
    <header className="sticky top-0 z-30 flex h-topbar items-center justify-between gap-2 border-b border-border bg-background px-card lg:hidden">
      <Link href="/dashboard" className="flex min-h-touch min-w-0 items-center text-section font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {t("eyebrow")}
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        <ThemeSwitcher compact />
        <LanguageSwitcher compact />
        <AccountDropdown profile={profile} compact />
      </div>
    </header>
  );
}
