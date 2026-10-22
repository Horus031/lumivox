import type { ReactNode } from "react";

import { AdminSectionTabs } from "@/features/admin/components/admin-section-tabs";

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="min-w-0 space-y-section">
      <div className="sticky top-topbar z-10 min-w-0 border-b border-border bg-background py-2">
        <AdminSectionTabs />
      </div>
      {children}
    </div>
  );
}
