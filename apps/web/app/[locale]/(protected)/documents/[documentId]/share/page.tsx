import { notFound } from "next/navigation";

import {
  getLearningDocumentPermissions,
  getOwnedLearningDocumentById,
} from "@/features/learning-documents/learning-document.queries";
import { ShareDocumentForm } from "@/features/learning-documents/components/share-document-form";
import { DocumentVisibilityControl } from "@/features/learning-documents/components/document-visibility-control";
import { DocumentPermissionList } from "@/features/learning-documents/components/document-permission-list";
import { DocumentShareLinkCard } from "@/features/learning-documents/components/document-share-link-card";

type DocumentSharePageProps = {
  params: Promise<{
    documentId: string;
  }>;
};

export default async function DocumentSharePage({
  params,
}: DocumentSharePageProps) {
  const { documentId } = await params;

  const document = await getOwnedLearningDocumentById(documentId);

  if (!document) {
    notFound();
  }

  const permissions = await getLearningDocumentPermissions(documentId);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-background p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Document Sharing
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          {document.file_name}
        </h1>

        <p className="mt-3 text-sm text-muted-foreground">
          Manage who can access this learning document.
        </p>
      </section>

      <DocumentShareLinkCard documentId={document.id} />

      <DocumentVisibilityControl document={document} />

      <ShareDocumentForm documentId={document.id} />

      <DocumentPermissionList permissions={permissions} />
    </main>
  );
}
