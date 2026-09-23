import type { Database } from "@/types/database.types";

export type LearningDocument =
  Database["public"]["Tables"]["learning_documents"]["Row"];

export type LearningDocumentInsert =
  Database["public"]["Tables"]["learning_documents"]["Insert"];

export type LearningDocumentVisibility =
  Database["public"]["Enums"]["learning_document_visibility"];

export type LearningDocumentListItem = Pick<
  LearningDocument,
  | "id"
  | "file_name"
  | "mime_type"
  | "file_size_bytes"
  | "visibility"
  | "extracted_text_status"
>;
