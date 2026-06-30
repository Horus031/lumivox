const OFFICE_PREVIEW_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export type LearningDocumentPreviewMode =
  | "pdf"
  | "image"
  | "text"
  | "office"
  | "download";

export function getLearningDocumentPreviewMode(
  mimeType: string,
): LearningDocumentPreviewMode {
  if (mimeType === "application/pdf") {
    return "pdf";
  }

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("text/")) {
    return "text";
  }

  if (OFFICE_PREVIEW_MIME_TYPES.has(mimeType)) {
    return "office";
  }

  return "download";
}

export function getOfficeViewerUrl(signedUrl: string) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`;
}