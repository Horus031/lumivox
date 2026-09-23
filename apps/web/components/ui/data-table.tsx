import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type DataTableProps = ComponentProps<"table"> & {
  containerClassName?: string;
  scrollContainerClassName?: string;
};

export function DataTable({
  children,
  className,
  containerClassName,
  scrollContainerClassName,
  ...props
}: DataTableProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border/60 bg-background",
        containerClassName,
      )}
    >
      <div className={cn("overflow-x-auto", scrollContainerClassName)}>
        <table
          className={cn("w-full border-collapse text-sm", className)}
          {...props}
        >
          {children}
        </table>
      </div>
    </div>
  );
}

