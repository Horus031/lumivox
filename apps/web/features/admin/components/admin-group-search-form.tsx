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
  const id = useId();

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
          <Label htmlFor={`${id}-status`}>
            {commonT("status")}
          </Label>

          <Select value={status} onValueChange={(value) => setStatus(value)}>
            <SelectTrigger id={`${id}-status`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{commonT("status")}</SelectLabel>
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
