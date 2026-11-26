"use client";

import {
  Brain,
  AlertCircle,
} from "lucide-react";

import { useTranslations } from "next-intl";

import type {
  RagContextMetadata,
} from "../rag-chat.actions";

type Props = {
  completedTurnCount: number;
  softTurnLimit: number;
  hardTurnLimit: number;
  context: RagContextMetadata | null;
};

export function RagContextIndicator({
  completedTurnCount,
  softTurnLimit,
  hardTurnLimit,
  context,
}: Props) {
  const t = useTranslations("rag");

  const reachedLimit =
    completedTurnCount >= hardTurnLimit;

  const nearLimit =
    completedTurnCount >= softTurnLimit &&
    !reachedLimit;

  return (
    <div className="space-y-2 py-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <Brain
            size={14}
            aria-hidden="true"
            className="shrink-0"
          />

          <span className="truncate">
            {t("conversationContext")}
          </span>
        </span>

        <span
          className="shrink-0 tabular-nums"
          aria-label={t("conversationTurns", { count: completedTurnCount })}
        >
          {completedTurnCount}/{hardTurnLimit}
        </span>
      </div>

      {context &&
        context.history_turns_used > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("contextTurnsUsed", {
              count: context.history_turns_used,
            })}
          </p>
        )}

      {context?.context_truncated && (
        <p className="text-xs text-muted-foreground">
          {t("recentContextOnly")}
        </p>
      )}

      {(nearLimit || reachedLimit) && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs"
        >
          <AlertCircle
            size={14}
            aria-hidden="true"
            className="mt-0.5 shrink-0"
          />

          <span>
            {t(
              reachedLimit
                ? "conversationLimitReached"
                : "conversationNearLimit",
            )}
          </span>
        </div>
      )}
    </div>
  );
}
