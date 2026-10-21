"use client";

import { Button } from "@/components/ui/button";
import { useLocale, useTranslations } from "next-intl";

type DocumentPreviewLinkProps = {
  document: { id: string };
};

export function DocumentPreviewLink({ document }: DocumentPreviewLinkProps) {
  const locale = useLocale();
  const t = useTranslations("goals.documents.list");

  function handleOpen() {
    window.open(
      `/${locale}/documents/shared/${document.id}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <Button
      type="button"
      onClick={handleOpen}
      className="px-4 py-2 text-sm font-medium transition "
    >
      {t("preview")}
    </Button>
  );
}
