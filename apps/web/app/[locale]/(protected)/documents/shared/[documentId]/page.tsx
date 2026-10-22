import { notFound } from "next/navigation";

import {
  getAccessibleLearningDocumentOrThrow,
  createLearningDocumentSignedUrl,
} from "@/features/learning-documents/learning-document.queries";
import { LearningDocumentPreview } from "@/features/learning-documents/components/learning-document-preview";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { getTranslations } from "next-intl/server";

type SharedDocumentPageProps = {
  params: Promise<{
    documentId: string;
  }>;
};

export default async function SharedDocumentPage({
  params,
}: SharedDocumentPageProps) {
  const { documentId } = await params;

  const [document, t] = await Promise.all([getAccessibleLearningDocumentOrThrow(documentId), getTranslations("documentUi")]);

  if (!document) {
    notFound();
  }

  const signedUrl = await createLearningDocumentSignedUrl(document.file_path);

  return (
    <section className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("sharedEyebrow")} title={document.file_name} description={`${t("visibilityField")}: ${t(`visibility.${document.visibility}`)}`} />
        <LearningDocumentPreview document={document} signedUrl={signedUrl} />
    </section>
  );
}
