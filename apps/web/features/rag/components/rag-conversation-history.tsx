"use client";

import { History } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import type { RagConversationListItem, RagHistoryCursor } from "../rag-chat.actions";

type Props = {
  open: boolean;
  disabled: boolean;
  loading: boolean;
  items: RagConversationListItem[];
  cursor: RagHistoryCursor | null;
  viewingSessionId: string | null;
  onOpenChange: (open: boolean) => void;
  onNextPage: (cursor: RagHistoryCursor) => void;
  onSelect: (item: RagConversationListItem) => void;
};

export function RagConversationHistory({
  open, disabled, loading, items, cursor, viewingSessionId, onOpenChange, onNextPage, onSelect,
}: Props) {
  const t = useTranslations("rag");
  const format = useFormatter();
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={disabled}>
          <History size={14} aria-hidden="true" /> {t("conversationHistory")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[60dvh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto">
        <PopoverTitle>{t("conversationHistory")}</PopoverTitle>
        {loading && <p role="status" className="py-2 text-xs">{t("restoringConversation")}</p>}
        {!loading && items.length === 0 && <p className="py-2 text-sm">{t("emptyHistory")}</p>}
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={item.id === viewingSessionId}
                onClick={() => onSelect(item)}
                disabled={disabled || loading || !item.content_available}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-60"
              >
                <span className="block wrap-anywhere font-medium">
                  {t(!item.content_available ? "historyAccessUnavailable"
                    : item.title === "Continued study conversation" ? "continuedConversationTitle"
                    : item.title === "Document study conversation" ? "documentConversationTitle" : "studyConversationTitle")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(item.status === "active" ? "currentConversation" : "previousConversation")}
                  {" · "}{t("conversationTurns", { count: item.completed_turn_count })}
                  {" · "}<time dateTime={item.created_at}>
                    {format.dateTime(new Date(item.created_at), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })}
                  </time>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {cursor && (
          <Button type="button" variant="ghost" size="sm" disabled={disabled || loading} onClick={() => onNextPage(cursor)}>
            {t("loadMoreHistory")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
