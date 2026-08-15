import type { ReactNode } from "react";

import { AdminSectionTabs } from "@/features/admin/components/admin-section-tabs";

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <>
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl md:px-6 lg:top-18 lg:px-8">
        <div className="mx-auto">
          <AdminSectionTabs />
        </div>
      </div>
      {children}
    </>
  );
}
