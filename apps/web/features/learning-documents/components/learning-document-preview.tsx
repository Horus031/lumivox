import type { LearningDocument } from "@/features/learning-documents/learning-document.types";
import {
  getLearningDocumentPreviewMode,
  getOfficeViewerUrl,
} from "@/features/learning-documents/learning-document-preview.utils";
import Link from "next/link";
import Image from "next/image";

type LearningDocumentPreviewProps = {
  document: LearningDocument;
  signedUrl: string;
};

async function getTextPreviewContent(signedUrl: string) {
  const response = await fetch(signedUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load text preview: ${response.statusText}`);
  }

  return response.text();
}

export async function LearningDocumentPreview({
  document,
  signedUrl,
}: LearningDocumentPreviewProps) {
  const previewMode = getLearningDocumentPreviewMode(document.mime_type);

  if (previewMode === "text") {
    const previewText = await getTextPreviewContent(signedUrl);

    return (
      <div className="space-y-4">
        <div className="rounded-xl border bg-background p-4 dark:border-neutral-800">
          <pre className="max-h-[75vh] overflow-auto whitespace-pre-wrap wrap-break-word text-sm leading-6 text-foreground">
            {previewText}
          </pre>
        </div>

        <Link
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex bg-neutral-900 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          Open original file
        </Link>
      </div>
    );
  }

  if (previewMode === "office") {
    return (
      <div className="space-y-4">
        <iframe
          src={getOfficeViewerUrl(signedUrl)}
          className="h-[75vh] w-full rounded-xl border dark:border-neutral-800"
          title={document.file_name}
        />

        <a
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          Open original file
        </a>
      </div>
    );
  }

  if (previewMode === "image") {
    return (
      <div className="space-y-4">
        <div className="flex justify-center rounded-xl border bg-background p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <Image
            src={signedUrl}
            alt={document.file_name}
            className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
          />
        </div>

        <a
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          Open original file
        </a>
      </div>
    );
  }

  if (previewMode === "pdf") {
    return (
      <div className="space-y-4">
        <iframe
          src={signedUrl}
          className="h-[75vh] w-full rounded-xl border dark:border-neutral-800"
          title={document.file_name}
        />

        <a
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          Open original file
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-8 text-center">
      <p className="text-muted-foreground">
        This file type cannot be previewed inline.
      </p>

      <a
        href={signedUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
      >
        Open Document
      </a>
    </div>
  );
}
