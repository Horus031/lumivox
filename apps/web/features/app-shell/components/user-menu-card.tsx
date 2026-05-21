import type { Profile } from "@/features/profiles/profile.types";
import { SignOutButton } from "@/features/app-shell/components/sign-out-button";

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
  return (
    <section className="">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-sm font-bold text-primary">
          {getInitials(profile.full_name)}
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {profile.full_name ?? "Lumivox User"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {profile.timezone}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <SignOutButton />
      </div>
    </section>
  );
}