"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TaskStatusPoint = {
  status: string;
  count: number;
};

type TaskStatusChartProps = {
  data: TaskStatusPoint[];
};

const TASK_STATUSES: Record<string, { key: string; color: string }> = {
  Todo: { key: "todo", color: "var(--text-muted)" },
  "In Progress": { key: "in_progress", color: "var(--info)" },
  "In Review": { key: "in_review", color: "var(--warning)" },
  Completed: { key: "completed", color: "hsl(var(--chart-1))" },
  Overdue: { key: "overdue", color: "var(--danger)" },
  Cancelled: { key: "cancelled", color: "var(--text-secondary)" },
};

export function TaskStatusChart({ data }: TaskStatusChartProps) {
  const t = useTranslations("dashboard.taskStatus");
  const statusT = useTranslations("tasks.form.statuses");
  const chartData = data.map((item) => ({
    ...item,
    label: TASK_STATUSES[item.status]
      ? statusT(TASK_STATUSES[item.status].key)
      : item.status,
  }));

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-card">
      <div className="mb-3">
        <h2 className="text-section font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-body text-secondary-text">
          {t("description")}
        </p>
      </div>

      {data.every((item) => item.count === 0) ? <div className="flex h-64 items-center justify-center text-body text-muted-foreground">{t("empty")}</div> : <div className="h-64 min-w-0 w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={256}
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 18, left: 4, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--chart-grid))"
            />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              dataKey="label"
              type="category"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickLine={false}
              width={104}
            />
            <Tooltip
              itemStyle={{ color: "var(--foreground)" }}
              contentStyle={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--overlay)",
                borderRadius: "var(--radius-lg)",
                color: "var(--foreground)",
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
            />
            <Bar
              dataKey="count"
              name={t("tasks")}
              radius={[0, 4, 4, 0]}
              maxBarSize={20}
            >
              {data.map((item) => (
                <Cell
                  fill={TASK_STATUSES[item.status]?.color ?? "var(--text-muted)"}
                  key={item.status}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>}
    </section>
  );
}
