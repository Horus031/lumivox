import type { Profile } from "@/features/profiles/profile.types";
import { AppNavigation } from "@/features/app-shell/components/app-navigation";

type MobileBottomNavProps = {
  profile: Profile;
};

export function MobileBottomNav({ profile }: MobileBottomNavProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border lg:hidden">
      <AppNavigation variant="mobile" profile={profile} />
    </div>
  );
}
