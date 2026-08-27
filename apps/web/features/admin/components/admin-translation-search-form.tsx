"use client";

import { useState } from "react";

import { useRouter } from "@/i18n/navigation";

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

  const [query, setQuery] = useState(initialQuery);
  const [targetLocale, setTargetLocale] = useState(initialTargetLocale);
  const [status, setStatus] = useState(initialStatus);

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
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div className="grid gap-4 md:grid-cols-[1fr_180px_180px_auto] md:items-end">
        <label className="space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Search translations
          </span>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by text, entity, owner, email..."
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Target locale
          </span>

          <select
            value={targetLocale}
            onChange={(event) => setTargetLocale(event.target.value)}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          >
            <option value="all">All</option>
            <option value="en">English</option>
            <option value="vi">Vietnamese</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Status
          </span>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          >
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </label>

        <button
          type="submit"
          className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          Search
        </button>
      </div>
    </form>
  );
}