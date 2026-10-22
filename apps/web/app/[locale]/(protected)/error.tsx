"use client";

import { AlertCircle, ArrowLeft, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function ProtectedError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("pageStates.error");
  return (
    <section role="alert" className="min-w-0 max-w-2xl space-y-3 py-section">
      <AlertCircle className="size-icon-lg text-foreground" aria-hidden="true" />
      <h1 className="text-page font-semibold text-foreground [overflow-wrap:anywhere]">{t("title")}</h1>
      <p className="text-body text-secondary-text">{t("description")}</p>
      <div className="flex min-w-0 flex-wrap gap-2 pt-1">
        <Button onClick={reset}><RotateCcw aria-hidden="true" />{t("retry")}</Button>
        <Button asChild variant="outline"><Link href="/dashboard"><ArrowLeft aria-hidden="true" />{t("dashboard")}</Link></Button>
      </div>
    </section>
  );
}
