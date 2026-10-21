"use client";

import { useState } from "react";
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
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
        <label className="space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("queryLabel")}
          </span>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("queryPlaceholder")}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("riskBandLabel")}
          </span>

          <select
            value={riskBand}
            onChange={(event) => setRiskBand(event.target.value)}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          >
            <option value="all">{t("riskBands.all")}</option>
            <option value="low">{t("riskBands.low")}</option>
            <option value="moderate">{t("riskBands.moderate")}</option>
            <option value="elevated">{t("riskBands.elevated")}</option>
            <option value="high">{t("riskBands.high")}</option>
          </select>
        </label>

        <button
          type="submit"
          className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          {t("submit")}
        </button>
      </div>
    </form>
  );
}
