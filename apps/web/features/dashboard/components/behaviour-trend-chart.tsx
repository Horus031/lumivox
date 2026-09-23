"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type BehaviourTrendPoint = {
  dateKey: string;
  label: string;
  focusMinutes: number;
  distractions: number;
};

type BehaviourTrendChartProps = {
  data: BehaviourTrendPoint[];
};

export function BehaviourTrendChart({ data }: BehaviourTrendChartProps) {
  const t = useTranslations("dashboard.behaviourTrend");

  return (
    <section className="flex h-full min-h-120 flex-col rounded-2xl bg-card/90 p-4 shadow-[0_16px_50px_-40px_hsl(var(--primary)/0.55)] sm:p-5 xl:min-h-168">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <div className="min-h-80 w-full flex-1">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={320}
        >
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--chart-grid))"
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "hsl(var(--chart-axis))", fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: "hsl(var(--chart-axis))", fontSize: 11 }}
              tickLine={false}
              label={{
                value: t("focusMinutes"),
                angle: -90,
                position: "insideLeft",
                fill: "hsl(var(--chart-axis))",
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: "hsl(var(--chart-axis))", fontSize: 11 }}
              tickLine={false}
              label={{
                value: t("distractions"),
                angle: 90,
                position: "insideRight",
                fill: "hsl(var(--chart-axis))",
              }}
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
            <Legend
              wrapperStyle={{
                color: "var(--text-secondary)",
                fontSize: 12,
                paddingTop: 12,
              }}
            />
            <Bar
              yAxisId="left"
              dataKey="focusMinutes"
              name={t("focusMinutes")}
              fill="hsl(var(--chart-1))"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="distractions"
              name={t("distractions")}
              stroke="hsl(var(--chart-2))"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "hsl(var(--chart-2))" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
