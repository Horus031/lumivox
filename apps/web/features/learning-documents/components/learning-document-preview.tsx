import type { LearningDocument } from "@/features/learning-documents/learning-document.types";
import { getLearningDocumentPreviewMode, getOfficeViewerUrl } from "@/features/learning-documents/learning-document-preview.utils";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

type LearningDocumentPreviewProps = { document: LearningDocument; signedUrl: string };

async function getTextPreviewContent(signedUrl: string) {
  const response = await fetch(signedUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load text preview: ${response.statusText}`);
  return response.text();
}
export async function LearningDocumentPreview({ document, signedUrl }: LearningDocumentPreviewProps) {
  const t = await getTranslations("documentUi");
  const previewMode = getLearningDocumentPreviewMode(document.mime_type);
  const originalLink = (
    <Button asChild variant="outline" size="sm">
      <a href={signedUrl} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />{t("original")}</a>
    </Button>
  );
  let content;
  if (previewMode === "text") {
    const previewText = await getTextPreviewContent(signedUrl);
    content = <pre tabIndex={0} aria-label={document.file_name} className="max-h-[65dvh] min-w-0 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-card p-card text-body text-foreground [overflow-wrap:anywhere]">{previewText}</pre>;
  } else if (previewMode === "pdf" || previewMode === "office") {
    content = <iframe src={previewMode === "office" ? getOfficeViewerUrl(signedUrl) : signedUrl} title={document.file_name} className="h-[65dvh] min-h-80 w-full rounded-lg border border-border bg-card" />;
  } else if (previewMode === "image") {
    content = (
      <div className="relative h-[min(65dvh,40rem)] w-full">
        <Image src={signedUrl} alt={document.file_name} fill unoptimized sizes="(max-width: 768px) 100vw, 75vw" className="object-contain" />
      </div>
    );
  } else {
    content = <p className="border-y border-border py-section text-body text-muted-foreground">{t("unsupported")}</p>;
  }
  return <div className="min-w-0 space-y-card">{content}{originalLink}</div>;
}
