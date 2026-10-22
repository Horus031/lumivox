"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";

type Props = {
  initialQuery?: string;
  initialRiskBand?: string;
};

export function AdminNativeTaskRiskSearchForm({
  initialQuery = "",
  initialRiskBand = "all",
}: Props) {
  const t = useTranslations("admin.nativeTaskRisk.search");
  const router = useRouter();
  const id = useId();

  const [query, setQuery] = useState(initialQuery);
  const [riskBand, setRiskBand] = useState(initialRiskBand);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (riskBand !== "all") {
      params.set("risk", riskBand);
    }

    router.push(
      `/admin/native-task-risk${params.toString() ? `?${params.toString()}` : ""}`
    );
  }

  return (
    <form onSubmit={handleSubmit} className="min-w-0">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <div className="col-span-2 grid min-w-0 gap-2 md:col-span-1">
          <Label htmlFor={`${id}-query`}>{t("queryLabel")}</Label>
          <Input id={`${id}-query`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("queryPlaceholder")} />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor={`${id}-risk`}>{t("riskBandLabel")}</Label>
          <Select value={riskBand} onValueChange={setRiskBand}>
            <SelectTrigger id={`${id}-risk`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{["all", "low", "moderate", "elevated", "high"].map((value) => <SelectItem key={value} value={value}>{t(`riskBands.${value}`)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button type="submit" size="icon" aria-label={t("submit")} title={t("submit")}><Search aria-hidden="true" /></Button>
      </div>
    </form>
  );
}
