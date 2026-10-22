import { notFound } from "next/navigation";

import {
  getLearningDocumentPermissions,
  getOwnedLearningDocumentById,
} from "@/features/learning-documents/learning-document.queries";
import { ShareDocumentForm } from "@/features/learning-documents/components/share-document-form";
import { DocumentVisibilityControl } from "@/features/learning-documents/components/document-visibility-control";
import { DocumentPermissionList } from "@/features/learning-documents/components/document-permission-list";
import { DocumentShareLinkCard } from "@/features/learning-documents/components/document-share-link-card";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { getTranslations } from "next-intl/server";

type DocumentSharePageProps = {
  params: Promise<{
    documentId: string;
  }>;
};

export default async function DocumentSharePage({
  params,
}: DocumentSharePageProps) {
  const { documentId } = await params;

  const [document, permissions, t] = await Promise.all([
    getOwnedLearningDocumentById(documentId),
    getLearningDocumentPermissions(documentId),
    getTranslations("documentUi"),
  ]);

  if (!document) {
    notFound();
  }

  return (
    <section className="min-w-0 max-w-5xl space-y-section">
      <PageHeader eyebrow={t("shareEyebrow")} title={document.file_name} description={t("shareDescription")} />

      <DocumentShareLinkCard documentId={document.id} />

      <DocumentVisibilityControl document={document} />

      <ShareDocumentForm documentId={document.id} />

      <DocumentPermissionList permissions={permissions} />
    </section>
  );
}
