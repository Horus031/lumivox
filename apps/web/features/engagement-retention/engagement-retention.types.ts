import type { Database } from "@/types/database.types";

export type UserEngagementStats =
  Database["public"]["Tables"]["user_engagement_stats"]["Row"];

export type RewardLedgerEntry =
  Database["public"]["Tables"]["reward_ledger"]["Row"];