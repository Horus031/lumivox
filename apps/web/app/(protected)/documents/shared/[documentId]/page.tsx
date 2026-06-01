import { notFound } from "next/navigation";

import {
  getAccessibleLearningDocumentOrThrow,
  createLearningDocumentSignedUrl,
} from "@/features/learning-documents/learning-document.queries";

type SharedDocumentPageProps = {
  params: Promise<{
    documentId: string;
  }>;
};

function canPreviewInline(mimeType: string) {
  return (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/") ||
    mimeType.startsWith("text/")
  );
}

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
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Shared Document
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
          {document.file_name}
        </h1>

        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          Visibility: {document.visibility}
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        {canPreviewInline(document.mime_type) ? (
          <iframe
            src={signedUrl}
            className="h-[75vh] w-full rounded-xl border dark:border-neutral-800"
            title={document.file_name}
          />
        ) : (
          <div className="p-8 text-center">
            <p className="text-neutral-600 dark:text-neutral-400">
              This file type cannot be previewed inline.
            </p>

            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
            >
              Open Document
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
