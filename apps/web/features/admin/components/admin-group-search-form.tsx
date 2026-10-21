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

type AdminGroupSearchFormProps = {
  initialQuery?: string;
  initialStatus?: string;
};

export function AdminGroupSearchForm({
  initialQuery = "",
  initialStatus = "all",
}: AdminGroupSearchFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.groups.search");
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
      `/admin/groups${params.toString() ? `?${params.toString()}` : ""}`,
    );
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
            {commonT("status")}
          </Label>

          <Select value={status} onValueChange={(value) => setStatus(value)}>
            <SelectTrigger className="w-full min-w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>AI Statuses</SelectLabel>
                <SelectItem value="all">{commonT("all")}</SelectItem>
                <SelectItem value="active">
                  {commonT("groupStatus.active")}
                </SelectItem>
                <SelectItem value="archived">
                  {commonT("groupStatus.archived")}
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
