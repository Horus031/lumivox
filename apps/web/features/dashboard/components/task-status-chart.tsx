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

const TASK_STATUS_COLORS = [
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-1))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function TaskStatusChart({ data }: TaskStatusChartProps) {
  const t = useTranslations("dashboard.taskStatus");

  return (
    <section className="flex h-full min-h-80 flex-col rounded-2xl bg-card/90 p-4 shadow-[0_16px_50px_-40px_hsl(var(--primary)/0.55)]">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <div className="min-h-52 w-full flex-1">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={208}
        >
          <BarChart
            data={data}
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
              tick={{ fill: "hsl(var(--chart-axis))", fontSize: 10 }}
              tickLine={false}
            />
            <YAxis
              dataKey="status"
              type="category"
              tick={{ fill: "hsl(var(--chart-axis))", fontSize: 10 }}
              tickLine={false}
              width={78}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--overlay)",
                borderRadius: 10,
                color: "var(--foreground)",
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
            />
            <Bar
              dataKey="count"
              name={t("tasks")}
              radius={[0, 8, 8, 0]}
            >
              {data.map((item, index) => (
                <Cell
                  fill={TASK_STATUS_COLORS[index % TASK_STATUS_COLORS.length]}
                  key={item.status}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
