import { requireAdmin } from "@/features/admin/admin-auth";

export async function getAdminAiMonitoringMetrics() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc(
    "admin_get_ai_monitoring_metrics"
  );

  if (error) {
    throw new Error(`Failed to fetch AI monitoring metrics: ${error.message}`);
  }

  return data?.[0] ?? null;
}

export async function searchAdminRagChatSessions({
  query = "",
  contextMode = "all",
}: {
  query?: string;
  contextMode?: string;
}) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc(
    "admin_search_rag_chat_sessions",
    {
      p_query: query,
      p_context_mode: contextMode,
      p_limit: 50,
      p_offset: 0,
    }
  );

  if (error) {
    throw new Error(`Failed to search RAG sessions: ${error.message}`);
  }

  return data ?? [];
}

export async function getAdminRagChatSessionDetail(sessionId: string) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc(
    "admin_get_rag_chat_session_detail",
    {
      p_session_id: sessionId,
    }
  );

  if (error) {
    throw new Error(`Failed to fetch RAG session detail: ${error.message}`);
  }

  return data?.[0] ?? null;
}

export async function getAdminRagChatMessages(sessionId: string) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_get_rag_chat_messages", {
    p_session_id: sessionId,
    p_limit: 100,
  });

  if (error) {
    throw new Error(`Failed to fetch RAG messages: ${error.message}`);
  }

  return data ?? [];
}

export async function getAdminRagEmptySourceAnswers() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc(
    "admin_get_rag_empty_source_answers",
    {
      p_limit: 20,
    }
  );

  if (error) {
    throw new Error(`Failed to fetch empty-source answers: ${error.message}`);
  }

  return data ?? [];
}