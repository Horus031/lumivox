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
    <section className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-section font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-caption text-secondary-text">
          {t("description")}
        </p>
      </div>

      {data.length === 0 ? <div className="flex h-48 items-center justify-center text-body text-muted-foreground">{t("empty")}</div> : <div className="h-48 min-w-0 w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={192}
        >
          <ComposedChart
            accessibilityLayer
            data={data}
            margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--chart-grid))"
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickLine={false}
              width={36}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              allowDecimals={false}
              tickLine={false}
              width={32}
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
            <Legend
              formatter={(value) => <span style={{ color: "var(--text-secondary)" }}>{value}</span>}
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
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="distractions"
              name={t("distractions")}
              stroke="var(--info)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--info)" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>}
    </section>
  );
}
