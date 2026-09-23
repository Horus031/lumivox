"use client";

import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type PaginationItem =
  | { type: "page"; value: number }
  | { direction: "backward" | "forward"; target: number; type: "ellipsis" };

type DataTablePaginationProps = {
  basePath: string;
  className?: string;
  page: number;
  pageParam?: string;
  searchParams?: Record<string, string | number | null | undefined>;
  totalPages: number;
};

const PAGE_WINDOW_SIZE = 5;

function clampPage(page: number, totalPages: number) {
  return Math.min(totalPages, Math.max(1, Math.floor(page)));
}

function getPaginationItems(
  totalPages: number,
  windowCenter: number,
): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => ({
      type: "page" as const,
      value: index + 1,
    }));
  }

  const halfWindow = Math.floor(PAGE_WINDOW_SIZE / 2);
  let start = Math.max(2, windowCenter - halfWindow);
  const end = Math.min(totalPages - 1, start + PAGE_WINDOW_SIZE - 1);

  start = Math.max(2, end - PAGE_WINDOW_SIZE + 1);

  const items: PaginationItem[] = [{ type: "page", value: 1 }];

  if (start > 2) {
    items.push({
      type: "ellipsis",
      direction: "backward",
      target: Math.max(1, start - PAGE_WINDOW_SIZE),
    });
  }

  for (let page = start; page <= end; page += 1) {
    items.push({ type: "page", value: page });
  }

  if (end < totalPages - 1) {
    items.push({
      type: "ellipsis",
      direction: "forward",
      target: Math.min(totalPages, end + PAGE_WINDOW_SIZE),
    });
  }

  items.push({ type: "page", value: totalPages });
  return items;
}

export function DataTablePagination({
  basePath,
  className,
  page,
  pageParam = "page",
  searchParams = {},
  totalPages,
}: DataTablePaginationProps) {
  const t = useTranslations("common.pagination");
  const router = useRouter();
  const jumpInputId = useId();
  const [isPending, startTransition] = useTransition();
  const safeTotalPages = Math.max(1, Math.floor(totalPages));
  const safePage = clampPage(page, safeTotalPages);
  const [windowCenter, setWindowCenter] = useState(safePage);
  const [jumpPage, setJumpPage] = useState(String(safePage));

  useEffect(() => {
    setWindowCenter(safePage);
    setJumpPage(String(safePage));
  }, [safePage]);

  const items = useMemo(
    () => getPaginationItems(safeTotalPages, windowCenter),
    [safeTotalPages, windowCenter],
  );

  function buildHref(targetPage: number) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && String(value).length > 0) {
        params.set(key, String(value));
      }
    }

    const normalizedPage = clampPage(targetPage, safeTotalPages);

    if (normalizedPage > 1) {
      params.set(pageParam, String(normalizedPage));
    } else {
      params.delete(pageParam);
    }

    const queryString = params.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  }

  function handleJump(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedPage = Number(jumpPage);
    const targetPage = clampPage(
      Number.isFinite(parsedPage) ? parsedPage : safePage,
      safeTotalPages,
    );

    setJumpPage(String(targetPage));
    startTransition(() => router.push(buildHref(targetPage)));
  }

  function handleJumpPageChange(value: string) {
    if (value === "") {
      setJumpPage("");
      return;
    }

    const parsedPage = Number(value);

    if (Number.isFinite(parsedPage)) {
      setJumpPage(String(clampPage(parsedPage, safeTotalPages)));
    }
  }

  const previousPage = clampPage(safePage - 1, safeTotalPages);
  const nextPage = clampPage(safePage + 1, safeTotalPages);

  return (
    <nav
      aria-label={t("ariaLabel")}
      className={cn("border-t border-border/50 pt-4", className)}
    >
      <div className="flex flex-col items-center justify-between gap-3 lg:flex-row">
        {/* <p className="text-sm text-muted-foreground">
          {t("showing", { page: safePage, totalPages: safeTotalPages })}
        </p> */}
        <form
          className="mt-4 flex flex-wrap items-center justify-center gap-2 lg:justify-end"
          onSubmit={handleJump}
        >
          <label
            className="text-sm text-muted-foreground"
            htmlFor={jumpInputId}
          >
            {t("jumpLabel")}
          </label>
          <Input
            aria-label={t("jumpLabel")}
            className="h-9 w-12 p-0 text-center tabular-nums"
            id={jumpInputId}
            inputMode="numeric"
            max={safeTotalPages}
            min={1}
            onBlur={() => {
              if (jumpPage === "") setJumpPage(String(safePage));
            }}
            onChange={(event) => handleJumpPageChange(event.target.value)}
            step={1}
            value={jumpPage}
          />
          <span className="text-sm text-muted-foreground">
            {t("of", { totalPages: safeTotalPages })}
          </span>
          <Button disabled={isPending} size="sm" type="submit">
            {t("go")}
          </Button>
        </form>

        <div className="flex max-w-full items-center gap-1 overflow-x-auto p-1">
          <Button asChild size="icon" variant="outline">
            <Link
              aria-disabled={safePage === 1}
              aria-label={t("previous")}
              className={cn(safePage === 1 && "pointer-events-none opacity-50")}
              href={buildHref(previousPage)}
              title={t("previous")}
            >
              <ChevronLeft />
            </Link>
          </Button>

          {items.map((item) =>
            item.type === "page" ? (
              <Button
                asChild
                className="size-9 px-0 tabular-nums"
                key={item.value}
                size="icon"
                variant={item.value === safePage ? "default" : "ghost"}
              >
                <Link
                  aria-current={item.value === safePage ? "page" : undefined}
                  href={buildHref(item.value)}
                >
                  {item.value}
                </Link>
              </Button>
            ) : (
              <Button
                aria-label={t(
                  item.direction === "backward"
                    ? "showPreviousPages"
                    : "showNextPages",
                )}
                className="size-9 px-0 text-muted-foreground"
                key={`${item.direction}-${item.target}`}
                onClick={() => setWindowCenter(item.target)}
                size="icon"
                title={t(
                  item.direction === "backward"
                    ? "showPreviousPages"
                    : "showNextPages",
                )}
                type="button"
                variant="ghost"
              >
                <MoreHorizontal />
              </Button>
            ),
          )}

          <Button asChild size="icon" variant="outline">
            <Link
              aria-disabled={safePage === safeTotalPages}
              aria-label={t("next")}
              className={cn(
                safePage === safeTotalPages && "pointer-events-none opacity-50",
              )}
              href={buildHref(nextPage)}
              title={t("next")}
            >
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
