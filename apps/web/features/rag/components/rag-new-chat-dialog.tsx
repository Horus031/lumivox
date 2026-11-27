"use client";

import { useId, useState } from "react";
import { RadioGroup } from "radix-ui";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RagNewChatMode } from "../rag-chat.actions";

type Scope = "general" | "keep" | "choose";
type Props = {
  onOpenChange: (open: boolean) => void;
  handoffEnabled: boolean;
  canContinueContext: boolean;
  memoryQuarantined: boolean;
  selectedDocumentIds: string[];
  documents: { id: string; file_name: string }[];
  isSubmitting: boolean;
  onConfirm: (input: { mode: RagNewChatMode; selectedDocumentIds: string[] }) => void;
};

export function RagNewChatDialog({
  onOpenChange, handoffEnabled, canContinueContext, memoryQuarantined, selectedDocumentIds, documents, isSubmitting, onConfirm,
}: Props) {
  const t = useTranslations("rag");
  const id = useId();
  const [mode, setMode] = useState<RagNewChatMode>("fresh");
  const [scope, setScope] = useState<Scope>("general");
  const [chosen, setChosen] = useState<string[]>([]);
  const canKeep = selectedDocumentIds.length > 0
    && selectedDocumentIds.every((documentId) => documents.some((document) => document.id === documentId));
  const canContinue = handoffEnabled && canContinueContext;
  const targetIds = mode === "continue" || (scope === "keep" && canKeep)
    ? selectedDocumentIds : scope === "choose" ? chosen : [];

  return (
    <Dialog open onOpenChange={(open) => { if (!isSubmitting) onOpenChange(open); }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto" showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>{t("newChatTitle")}</DialogTitle>
          <DialogDescription>{t("newChatDescription")}</DialogDescription>
        </DialogHeader>
        <RadioGroup.Root
          aria-labelledby={`${id}-modes`}
          value={mode}
          disabled={isSubmitting}
          className="grid gap-2"
          onValueChange={(value) => setMode(value === "continue" ? "continue" : "fresh")}
        >
          <span id={`${id}-modes`} className="sr-only">{t("newChatTitle")}</span>
          {(["fresh", "continue"] as const).map((value) => (
            <label key={value} className="flex items-start gap-3 rounded-md border p-3 text-sm">
              <RadioGroup.Item
                aria-labelledby={`${id}-${value}`}
                aria-describedby={`${id}-${value}-description`}
                className="mt-0.5 size-4 shrink-0 rounded-full border border-foreground disabled:opacity-50"
                disabled={value === "continue" && !canContinue}
                value={value}
              >
                <RadioGroup.Indicator className="m-0.5 block size-2.5 rounded-full bg-primary" />
              </RadioGroup.Item>
              <span>
                <span id={`${id}-${value}`} className="block font-medium">
                  {t(value === "fresh" ? "startFresh" : "continueWithContext")}
                </span>
                <span id={`${id}-${value}-description`} className="text-muted-foreground">
                  {t(value === "fresh" ? "startFreshDescription"
                    : memoryQuarantined ? "memoryContinuationUnavailable" : "continueWithContextDescription")}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup.Root>
        {mode === "continue" ? (
          <p className="text-sm text-muted-foreground">{t("conversationScopeLocked")}</p>
        ) : (
          <fieldset disabled={isSubmitting} className="space-y-2">
            <legend className="text-sm font-medium">{t("documentContext")}</legend>
            {(["general", "keep", "choose"] as const).map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${id}-scope`}
                  checked={scope === value}
                  disabled={(value === "keep" && !canKeep) || (value === "choose" && !documents.length)}
                  onChange={() => setScope(value)}
                />
                {t({ general: "generalAi", keep: "keepSelectedDocuments", choose: "chooseDifferentDocuments" }[value])}
              </label>
            ))}
            {scope === "choose" && (
              <div className="max-h-40 space-y-2 overflow-y-auto rounded border p-2">
                {documents.map((document) => (
                  <label key={document.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={chosen.includes(document.id)}
                      onChange={() => setChosen((current) => current.includes(document.id)
                        ? current.filter((item) => item !== document.id) : [...current, document.id])}
                    />
                    <span className="wrap-anywhere">{document.file_name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
            {t("cancelNewChat")}
          </Button>
          <Button
            type="button"
            disabled={isSubmitting || (mode === "continue" && !canContinue)
              || (mode === "fresh" && scope === "choose" && chosen.length === 0)}
            onClick={() => onConfirm({ mode, selectedDocumentIds: targetIds })}
          >
            {t(isSubmitting ? "creatingConversation" : "newChat")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
