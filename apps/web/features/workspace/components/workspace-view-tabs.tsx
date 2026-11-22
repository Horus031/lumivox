import { CalendarRange, Columns3, List as ListIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { WorkspaceView } from "../workspace.types";
import { workspaceHref } from "../workspace.utils";

const VIEWS = [
  { id: "list", icon: ListIcon },
  { id: "board", icon: Columns3 },
  { id: "timeline", icon: CalendarRange },
] as const;

export async function WorkspaceViewTabs({ goal, view }: { goal: string; view: WorkspaceView }) {
  const t = await getTranslations("workspace.views");

  return (
    <nav aria-label={t("label")} className="flex gap-1 border-b border-border">
      {VIEWS.map(({ id, icon: Icon }) => (
        <Link
          key={id}
          href={workspaceHref(goal, id)}
          prefetch={false}
          scroll={false}
          aria-current={view === id ? "page" : undefined}
          className={cn(
            "-mb-px flex min-h-touch shrink-0 items-center gap-2 rounded-t-md border-b-2 px-2.5 text-label font-medium sm:px-3",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            view === id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
          {t(id)}
        </Link>
      ))}
    </nav>
  );
}
