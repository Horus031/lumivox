import { notFound } from "next/navigation";

import {
  getAccessibleLearningDocumentOrThrow,
  createLearningDocumentSignedUrl,
} from "@/features/learning-documents/learning-document.queries";
import { LearningDocumentPreview } from "@/features/learning-documents/components/learning-document-preview";

type SharedDocumentPageProps = {
  params: Promise<{
    documentId: string;
  }>;
};

export default async function SharedDocumentPage({
  params,
}: SharedDocumentPageProps) {
  const { documentId } = await params;

  const document = await getAccessibleLearningDocumentOrThrow(documentId);

  if (!document) {
    notFound();
  }

  const signedUrl = await createLearningDocumentSignedUrl(document.file_path);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-background p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Shared Document
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          {document.file_name}
        </h1>

        <p className="mt-3 text-sm text-muted-foreground">
          Visibility: {document.visibility}
        </p>
      </section>

      <section className="rounded-2xl border bg-background p-4 shadow-sm">
        <LearningDocumentPreview document={document} signedUrl={signedUrl} />
      </section>
    </main>
  );
}
