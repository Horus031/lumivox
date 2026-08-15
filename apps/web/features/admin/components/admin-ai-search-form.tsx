"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type AdminAiSearchFormProps = {
  initialQuery?: string;
  initialContextMode?: string;
};

export function AdminAiSearchForm({
  initialQuery = "",
  initialContextMode = "all",
}: AdminAiSearchFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.ai.search");
  const commonT = useTranslations("admin.common");
  const [query, setQuery] = useState(initialQuery);
  const [contextMode, setContextMode] = useState(initialContextMode);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (contextMode !== "all") {
      params.set("mode", contextMode);
    }

    router.push(`/admin/ai${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl shadow-sm">
      <div className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">
            {t("label")}
          </Label>

          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("placeholder")}
          />
        </div>

        <div>
          <Label className="text-sm font-medium text-foreground">
            {t("contextMode")}
          </Label>

          <Select
            value={contextMode}
            onValueChange={(value) => setContextMode(value)}
          >
            <SelectTrigger className="w-full min-w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>AI Statuses</SelectLabel>
                <SelectItem value="all">{commonT("all")}</SelectItem>
                <SelectItem value="general">
                  {commonT("contextModes.general")}
                </SelectItem>
                <SelectItem value="document_rag">
                  {commonT("contextModes.document_rag")}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          size={"lg"}
        >
          {commonT("search")}
        </Button>
      </div>
    </form>
  );
}
