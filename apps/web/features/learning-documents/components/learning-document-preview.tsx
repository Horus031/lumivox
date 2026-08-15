import type { LearningDocument } from "@/features/learning-documents/learning-document.types";
import {
  getLearningDocumentPreviewMode,
  getOfficeViewerUrl,
} from "@/features/learning-documents/learning-document-preview.utils";
import { Link } from "@/i18n/navigation";
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

  console.log(previewMode);

  if (previewMode === "text") {
    const previewText = await getTextPreviewContent(signedUrl);

    return (
      <div className="space-y-4">
        <div className="rounded-xl border bg-background p-4 dark:border-neutral-800">
          <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap wrap-break-word text-sm leading-6 text-foreground">
            {previewText}
          </pre>
        </div>

        <Link
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-foreground transition"
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

        <Link
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-foreground transition"
        >
          Open original file
        </Link>
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

        <Link
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-foreground transition"
        >
          Open original file
        </Link>
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

        <Link
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-foreground transition"
        >
          Open original file
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-8 text-center">
      <p className="text-muted-foreground">
        This file type cannot be previewed inline.
      </p>

      <Link
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-foreground transition"
        >
          Open document
        </Link>
    </div>
  );
}
