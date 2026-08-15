"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
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
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <p className="mt-1 text-sm text-neutral-600">{t("description")}</p>
      </div>

      <div className="h-85 w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={320}
          minHeight={340}
        >
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--chart-grid))"
            />
            <XAxis dataKey="label" tick={{ fill: "hsl(var(--chart-axis))" }} />
            <YAxis
              yAxisId="left"
              tick={{ fill: "hsl(var(--chart-axis))" }}
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
              tick={{ fill: "hsl(var(--chart-axis))" }}
              label={{
                value: t("distractions"),
                angle: 90,
                position: "insideRight",
                fill: "hsl(var(--chart-axis))",
              }}
            />
            <Tooltip />
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
