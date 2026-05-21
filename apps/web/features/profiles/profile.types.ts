import type { Database } from "@/types/database.types";

export type Profile =
  Database["public"]["Tables"]["profiles"]["Row"];

export type PbiWeightProfile =
  Database["public"]["Tables"]["pbi_weight_profiles"]["Row"];