"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type DocumentShareLinkCardProps = { documentId: string };

export function DocumentShareLinkCard({ documentId }: DocumentShareLinkCardProps) {
  const locale = useLocale();
  const t = useTranslations("documentUi");
  const sharePath = `/${locale}/documents/shared/${documentId}`;
  const [shareUrl, setShareUrl] = useState(sharePath);
  useEffect(() => { setShareUrl(`${window.location.origin}${sharePath}`); }, [sharePath]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <section className="min-w-0 border-t border-border pt-card">
      <h2 className="text-section font-semibold">{t("linkTitle")}</h2>
      <p className="mt-1 text-body text-secondary-text">{t("linkDescription")}</p>
      <div className="mt-3 flex min-w-0 items-center gap-2">
        <Input readOnly value={shareUrl} aria-label={t("linkTitle")} className="min-w-0 flex-1" />
        <Button type="button" size="icon" variant="outline" onClick={handleCopy} aria-label={t("copy")} title={t("copy")}><Copy aria-hidden="true" /></Button>
      </div>
    </section>
  );
}
