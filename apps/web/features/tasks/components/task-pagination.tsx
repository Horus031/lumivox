import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

type TaskPaginationProps = {
  page: number;
  totalPages: number;
  hasFilters: boolean;
  filters: {
    q: string;
    status?: string;
    priority?: string;
    goalId?: string;
  };
};

function buildHref(page: number, filters: TaskPaginationProps["filters"]) {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set("page", String(page));
  }

  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.goalId) params.set("goalId", filters.goalId);

  const queryString = params.toString();

  return queryString ? `/tasks?${queryString}` : "/tasks";
}

export function TaskPagination({
  page,
  totalPages,
  filters,
}: TaskPaginationProps) {
  const t = useTranslations("tasks.pagination");
  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border/50 pt-4 sm:flex-row">
      <p className="text-sm text-muted-foreground">
        {t("showing", { page, totalPages })}
      </p>

      <div className="flex items-center gap-2">
        <Link
          aria-disabled={isFirstPage}
          className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium ring-1 ring-border/60 transition ${
            isFirstPage
              ? "pointer-events-none bg-muted/50 text-muted-foreground"
              : "bg-background text-foreground hover:bg-muted/70"
          }`}
          href={
            isFirstPage ? buildHref(1, filters) : buildHref(page - 1, filters)
          }
        >
          <ChevronLeft className="h-4 w-4" />
          {t("previous")}
        </Link>

        <Link
          aria-disabled={isLastPage}
          className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium ring-1 ring-border/60 transition ${
            isLastPage
              ? "pointer-events-none bg-muted/50 text-muted-foreground"
              : "bg-background text-foreground hover:bg-muted/70"
          }`}
          href={
            isLastPage ? buildHref(page, filters) : buildHref(page + 1, filters)
          }
        >
          {t("next")}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
