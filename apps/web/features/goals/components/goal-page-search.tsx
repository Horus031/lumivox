"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchGoalsAction } from "../goal.actions";
import type { GoalPage, GoalPageCursor, GoalPageItem } from "../goal.types";

type SearchResult = { search: string; initialPage: GoalPage | undefined; page: GoalPage | null };

export function GoalPageSearch({
  initialPage,
  includeProgress = false,
  renderItem,
}: {
  initialPage?: GoalPage;
  includeProgress?: boolean;
  renderItem: (goal: GoalPageItem) => ReactNode;
}) {
  const t = useTranslations("goals.search");
  const inputId = useId();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<SearchResult>();
  const [retry, setRetry] = useState(0);
  const [more, setMore] = useState<{ cursor: GoalPageCursor; failed: boolean }>();
  const requestId = useRef(0);
  const search = input.trim();
  const page = result?.search === search && result.initialPage === initialPage
    ? result.page
    : search ? undefined : initialPage;

  useEffect(() => {
    if (!search && initialPage) return;

    const request = ++requestId.current;
    const timer = window.setTimeout(async () => {
      const next = await searchGoalsAction({ search, cursor: null, includeProgress }).catch(() => null);
      if (request === requestId.current) setResult({ search, initialPage, page: next });
    }, search ? 300 : 0);

    return () => {
      window.clearTimeout(timer);
      requestId.current++;
    };
  }, [search, initialPage, includeProgress, retry]);

  async function loadMore() {
    if (!page?.nextCursor) return;
    const cursor = page.nextCursor;
    const request = ++requestId.current;
    setMore({ cursor, failed: false });
    const next = await searchGoalsAction({ search, cursor, includeProgress }).catch(() => null);
    if (request !== requestId.current) return;
    if (!next) {
      setMore({ cursor, failed: true });
      return;
    }

    setMore(undefined);
    setResult({ search, initialPage, page: { items: [...page.items, ...next.items], nextCursor: next.nextCursor } });
  }

  const moreStatus = more?.cursor === page?.nextCursor ? more : undefined;
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={inputId} className="sr-only">{t("label")}</label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          type="search"
          value={input}
          maxLength={160}
          placeholder={t("label")}
          className="ps-8"
          onChange={(event) => {
            const value = event.target.value;
            setInput(value);
            if (value.trim() === search) return;
            requestId.current++;
            setResult(undefined);
            setMore(undefined);
          }}
        />
      </div>

      {page === undefined && <p role="status" className="px-2 py-1 text-caption text-muted-foreground">{t("loading")}</p>}
      {page === null && (
        <div className="space-y-1">
          <p role="status" className="px-2 text-caption text-muted-foreground">{t("error")}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => {
            setResult(undefined);
            setRetry((attempt) => attempt + 1);
          }}>{t("retry")}</Button>
        </div>
      )}
      {page?.items.length === 0 && <p role="status" className="px-2 py-1 text-caption text-muted-foreground">{t(search ? "noResults" : "empty")}</p>}
      {page && page.items.length > 0 && (
        <ul className="max-h-80 space-y-1 overflow-y-auto overscroll-contain">
          {page.items.map((goal) => <li key={goal.id}>{renderItem(goal)}</li>)}
        </ul>
      )}
      {page?.nextCursor && (
        <div>
          {moreStatus?.failed && <p role="status" className="px-2 text-caption text-muted-foreground">{t("error")}</p>}
          <Button type="button" variant="ghost" size="sm" disabled={Boolean(moreStatus && !moreStatus.failed)} onClick={loadMore}>
            {moreStatus ? t(moreStatus.failed ? "retry" : "loading") : t("more")}
          </Button>
        </div>
      )}
    </div>
  );
}
