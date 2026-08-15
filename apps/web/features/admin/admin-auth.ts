import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";

export async function requireAdmin() {
  const { supabase, user } = await requireUser();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,role,full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify admin access: ${error.message}`);
  }

  if (!profile || profile.role !== "admin") {
    notFound();
  }

  return {
    supabase,
    user,
    profile,
  };
}