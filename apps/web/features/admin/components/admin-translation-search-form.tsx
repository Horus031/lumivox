"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AdminTranslationSearchFormProps = {
  initialQuery?: string;
  initialTargetLocale?: string;
  initialStatus?: string;
};

export function AdminTranslationSearchForm({
  initialQuery = "",
  initialTargetLocale = "all",
  initialStatus = "all",
}: AdminTranslationSearchFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.translations.search");
  const commonT = useTranslations("admin.common");

  const [query, setQuery] = useState(initialQuery);
  const [targetLocale, setTargetLocale] = useState(initialTargetLocale);
  const [status, setStatus] = useState(initialStatus);
  const id = useId();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (targetLocale !== "all") {
      params.set("locale", targetLocale);
    }

    if (status !== "all") {
      params.set("status", status);
    }

    router.push(
      `/admin/ai/translations${
        params.toString() ? `?${params.toString()}` : ""
      }`
    );
  }

  return (
    <form onSubmit={handleSubmit} className="min-w-0">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]">
        <div className="col-span-2 grid min-w-0 gap-2 sm:col-span-3 xl:col-span-1">
          <Label htmlFor={`${id}-query`}>{t("label")}</Label>
          <Input id={`${id}-query`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("placeholder")} />
        </div>
        <div className="col-span-2 grid min-w-0 gap-2 sm:col-span-1">
          <Label htmlFor={`${id}-locale`}>{t("targetLocale")}</Label>
          <Select value={targetLocale} onValueChange={setTargetLocale}>
            <SelectTrigger id={`${id}-locale`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{commonT("all")}</SelectItem>{["en", "vi"].map((value) => <SelectItem key={value} value={value}>{t(`locales.${value}`)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor={`${id}-status`}>{commonT("status")}</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id={`${id}-status`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{commonT("all")}</SelectItem>{["completed", "failed"].map((value) => <SelectItem key={value} value={value}>{t(`statuses.${value}`)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button type="submit" size="icon" aria-label={commonT("search")} title={commonT("search")}><Search aria-hidden="true" /></Button>
      </div>
    </form>
  );
}
