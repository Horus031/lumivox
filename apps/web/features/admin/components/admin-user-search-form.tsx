"use client";

import { useState } from "react";
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
    <form onSubmit={handleSubmit} className="rounded-2xl shadow-sm">
      <label className="block space-y-2">
        <Label className="text-sm font-medium text-foreground">
          {t("label")}
        </Label>

        <div className="flex flex-col gap-3 md:flex-row">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("placeholder")}
          />

          <Button type="submit" size={"lg"}>
            {commonT("search")}
          </Button>
        </div>
      </label>
    </form>
  );
}
