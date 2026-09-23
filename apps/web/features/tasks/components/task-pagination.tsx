import { DataTablePagination } from "@/components/ui/data-table-pagination";

type TaskPaginationProps = {
  page: number;
  totalPages: number;
  filters: {
    q: string;
    status?: string;
    priority?: string;
    goalId?: string;
  };
};

export function TaskPagination({
  page,
  totalPages,
  filters,
}: TaskPaginationProps) {
  return (
    <DataTablePagination
      basePath="/tasks"
      page={page}
      searchParams={filters}
      totalPages={totalPages}
    />
  );
}
