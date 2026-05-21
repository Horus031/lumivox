import { requireUser } from "@/lib/auth/require-user";

export async function getCurrentProfile() {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    throw new Error(`Failed to fetch profile: ${error.message}`);
  }

  return data;
}

export async function getCurrentPbiWeightProfile() {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("pbi_weight_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    throw new Error(
      `Failed to fetch PBI weight profile: ${error.message}`
    );
  }

  return data;
}

export async function getCurrentProfileWithWeights() {
  const [profile, weights] = await Promise.all([
    getCurrentProfile(),
    getCurrentPbiWeightProfile(),
  ]);

  return {
    profile,
    weights,
  };
}