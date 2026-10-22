"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type AdminUserSearchFormProps = {
  initialQuery?: string;
};

export function AdminUserSearchForm({
  initialQuery = "",
}: AdminUserSearchFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.users.search");
  const commonT = useTranslations("admin.common");
  const [query, setQuery] = useState(initialQuery);
  const id = useId();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    router.push(
      `/admin/users${params.toString() ? `?${params.toString()}` : ""}`,
    );
  }

  return (
    <form onSubmit={handleSubmit} className="min-w-0 space-y-2">
        <Label htmlFor={id}>
          {t("label")}
        </Label>

        <div className="flex min-w-0 gap-2">
          <Input
            id={id}
            type="search"
            className="min-w-0 flex-1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("placeholder")}
          />

          <Button type="submit" size="icon" aria-label={commonT("search")} title={commonT("search")}>
            <Search aria-hidden="true" />
          </Button>
        </div>
    </form>
  );
}
