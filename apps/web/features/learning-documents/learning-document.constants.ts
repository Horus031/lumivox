export const LEARNING_DOCUMENT_BUCKET = "learning-documents";

export const MAX_LEARNING_DOCUMENT_SIZE_BYTES = 6 * 1024 * 1024;

export const ALLOWED_LEARNING_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export function isAllowedLearningDocumentMimeType(mimeType: string) {
  return ALLOWED_LEARNING_DOCUMENT_MIME_TYPES.includes(
    mimeType as (typeof ALLOWED_LEARNING_DOCUMENT_MIME_TYPES)[number],
  );
}
