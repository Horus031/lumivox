import { getTranslations } from "next-intl/server";
import { getWorkspaceGoalsDirectory } from "../workspace-preview.queries";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statuses = ["active", "completed", "paused", "archived"] as const;

export async function WorkspaceGoalsDirectory({
  params,
  locale,
}: {
  params: Record<string, string | string[] | undefined>;
  locale: string;
}) {
  const [data, t] = await Promise.all([getWorkspaceGoalsDirectory(params), getTranslations("workspace.mvp")]);
  const query = new URLSearchParams({ view: "goals" });
  if (data.search) query.set("goalSearch", data.search);
  if (data.status) query.set("goalStatus", data.status);

  return (
    <section className="min-w-0 space-y-4">
      <h2 className="text-xl font-semibold">{t("goals")}</h2>
      <form method="get" action={`/${locale}/workspace`} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="view" value="goals" />
        <label className="grid min-w-0 gap-1 text-sm">
          {t("goalSearch")}
          <Input name="goalSearch" maxLength={120} defaultValue={data.search} />
        </label>
        <label className="grid gap-1 text-sm">
          {t("goalStatus")}
          <select name="goalStatus" defaultValue={data.status ?? ""} className="h-9 rounded-md border bg-background px-2">
            <option value="">{t("allStatuses")}</option>
            {statuses.map((status) => <option key={status} value={status}>{t(`goalStatuses.${status}`)}</option>)}
          </select>
        </label>
        <Button type="submit">{t("search")}</Button>
      </form>
      {data.goals.length ? (
        <ul className="divide-y rounded-xl border bg-card">
          {data.goals.map((goal) => (
            <li key={goal.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <Link className="min-w-0 break-words font-medium hover:underline" href={`/workspace?goal=${goal.id}`} prefetch={false}>{goal.title}</Link>
              <span className="text-sm text-muted-foreground">{t(`goalStatuses.${goal.status}`)}</span>
            </li>
          ))}
        </ul>
      ) : <p>{t("noGoals")}</p>}
      <div className="flex flex-wrap gap-2">
        {data.page > 1 && <Button variant="outline" asChild><Link href={`/workspace?${query}&page=${data.page - 1}`}>{t("previous")}</Link></Button>}
        {data.hasNext && <Button variant="outline" asChild><Link href={`/workspace?${query}&page=${data.page + 1}`}>{t("next")}</Link></Button>}
      </div>
    </section>
  );
}
