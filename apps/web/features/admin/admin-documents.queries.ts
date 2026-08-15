import { requireAdmin } from "@/features/admin/admin-auth";

export async function searchAdminLearningDocuments({
  query = "",
  status = "all",
}: {
  query?: string;
  status?: string;
}) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc(
    "admin_search_learning_documents",
    {
      p_query: query,
      p_status: status,
      p_limit: 50,
      p_offset: 0,
    }
  );

  if (error) {
    throw new Error(`Failed to search learning documents: ${error.message}`);
  }

  return data ?? [];
}

export async function getAdminLearningDocumentDetail(documentId: string) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc(
    "admin_get_learning_document_detail",
    {
      p_document_id: documentId,
    }
  );

  if (error) {
    throw new Error(`Failed to fetch document detail: ${error.message}`);
  }

  return data?.[0] ?? null;
}

export async function getAdminDocumentChunks(documentId: string) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_get_document_chunks", {
    p_document_id: documentId,
    p_limit: 50,
  });

  if (error) {
    throw new Error(`Failed to fetch document chunks: ${error.message}`);
  }

  return data ?? [];
}