import { AppNavigation } from "@/features/app-shell/components/app-navigation";

export function MobileBottomNav() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3 lg:hidden">
      <AppNavigation variant="mobile" />
    </div>
  );
}