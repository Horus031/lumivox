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

type AdminDocumentSearchFormProps = {
  initialQuery?: string;
  initialStatus?: string;
};

export function AdminDocumentSearchForm({
  initialQuery = "",
  initialStatus = "all",
}: AdminDocumentSearchFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.documents.search");
  const commonT = useTranslations("admin.common");
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (status !== "all") {
      params.set("status", status);
    }

    router.push(
      `/admin/documents${params.toString() ? `?${params.toString()}` : ""}`,
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl shadow-sm">
      <div className="flex items-end gap-4">
        <div className="space-y-2 w-full">
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
            {commonT("aiStatus")}
          </Label>

          <Select value={status} onValueChange={(value) => setStatus(value)}>
            <SelectTrigger className="w-full min-w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>AI Statuses</SelectLabel>
                <SelectItem value="all">{commonT("all")}</SelectItem>
                <SelectItem value="pending">
                  {commonT("aiStatuses.pending")}
                </SelectItem>
                <SelectItem value="processing">
                  {commonT("aiStatuses.processing")}
                </SelectItem>
                <SelectItem value="completed">
                  {commonT("aiStatuses.completed")}
                </SelectItem>
                <SelectItem value="failed">
                  {commonT("aiStatuses.failed")}
                </SelectItem>
                <SelectItem value="unsupported">
                  {commonT("aiStatuses.unsupported")}
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
