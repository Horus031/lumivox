"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";

type AdminRoadmapSearchFormProps = {
  initialQuery?: string;
  initialStatus?: string;
};

export function AdminRoadmapSearchForm({
  initialQuery = "",
  initialStatus = "all",
}: AdminRoadmapSearchFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.roadmaps.search");
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
      `/admin/roadmaps${params.toString() ? `?${params.toString()}` : ""}`
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
            {t("label")}
          </span>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("placeholder")}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {commonT("status")}
          </span>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          >
            <option value="all">{commonT("all")}</option>
            <option value="draft">{t("statuses.draft")}</option>
            <option value="applied">{t("statuses.applied")}</option>
            <option value="archived">{t("statuses.archived")}</option>
          </select>
        </label>

        <button
          type="submit"
          className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          {commonT("search")}
        </button>
      </div>
    </form>
  );
}
