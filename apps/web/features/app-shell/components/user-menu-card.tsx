import type { Profile } from "@/features/profiles/profile.types";
import { useTranslations } from "next-intl";

type UserMenuCardProps = {
  profile: Profile;
};

function getInitials(name: string | null) {
  if (!name) return "LU";

  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export function UserMenuCard({ profile }: UserMenuCardProps) {
  const t = useTranslations("appShell.sidebar");

  return (
    <section className="desktop-sidebar-user rounded-2xl bg-background/70 p-2 ring-1 ring-border/60 transition-all duration-300">
      <div className="desktop-sidebar-user-inner flex items-center gap-3">
        <div className="desktop-sidebar-avatar flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-sm font-bold text-primary">
          {getInitials(profile.full_name)}
        </div>

        <div className="desktop-sidebar-user-copy min-w-0 transition-all duration-200">
          <p className="truncate text-sm font-semibold text-foreground">
            {profile.full_name ?? t("fallbackUser")}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {profile.timezone}
          </p>
        </div>
      </div>
    </section>
  );
}
