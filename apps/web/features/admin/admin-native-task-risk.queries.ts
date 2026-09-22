import { notFound } from "next/navigation";

import { requireAdmin } from "@/features/admin/admin-auth";

export async function getAdminNativeTaskRiskMetrics() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc(
    "admin_get_native_task_risk_metrics"
  );

  if (error) {
    throw new Error(`Failed to load native task risk metrics: ${error.message}`);
  }

  return data?.[0] ?? null;
}

export async function getAdminNativeTaskRiskModelVersions() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc(
    "admin_get_native_task_risk_model_versions"
  );

  if (error) {
    throw new Error(`Failed to load native task risk models: ${error.message}`);
  }

  return data ?? [];
}

export async function searchAdminNativeTaskRiskPredictions({
  query = "",
  riskBand = "all",
}: {
  query?: string;
  riskBand?: string;
}) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc(
    "admin_search_native_task_risk_predictions",
    {
      p_query: query,
      p_risk_band: riskBand,
      p_limit: 50,
      p_offset: 0,
    }
  );

  if (error) {
    throw new Error(
      `Failed to search native task risk predictions: ${error.message}`
    );
  }

  return data ?? [];
}

export async function getAdminNativeTaskRiskPredictionDetail(
  predictionId: string
) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc(
    "admin_get_native_task_risk_prediction_detail",
    {
      p_prediction_id: predictionId,
    }
  );

  if (error) {
    throw new Error(
      `Failed to load native task risk prediction detail: ${error.message}`
    );
  }

  const prediction = data?.[0] ?? null;

  if (!prediction) {
    notFound();
  }

  return prediction;
}