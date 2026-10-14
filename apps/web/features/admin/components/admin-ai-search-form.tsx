"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";
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
  const id = useId();

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
    <form onSubmit={handleSubmit} className="min-w-0">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <div className="col-span-2 grid min-w-0 gap-2 md:col-span-1">
          <Label htmlFor={`${id}-query`}>
            {t("label")}
          </Label>

          <Input
            id={`${id}-query`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("placeholder")}
          />
        </div>

        <div className="grid min-w-0 gap-2">
          <Label htmlFor={`${id}-mode`}>
            {t("contextMode")}
          </Label>

          <Select
            value={contextMode}
            onValueChange={(value) => setContextMode(value)}
          >
            <SelectTrigger id={`${id}-mode`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{t("contextMode")}</SelectLabel>
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
          size="icon"
          aria-label={commonT("search")}
          title={commonT("search")}
        >
          <Search aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
