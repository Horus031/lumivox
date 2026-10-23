"use client";

import { useTranslations } from "next-intl";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PbiHistoryPoint = {
  label: string;
  standardPbi: number;
  personalizedPbi: number;
};

type PbiHistoryChartProps = {
  data: PbiHistoryPoint[];
};

export function PbiHistoryChart({ data }: PbiHistoryChartProps) {
  const t = useTranslations("dashboard.pbiHistory");

  return (
    <section className="h-full min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-section font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-caption text-secondary-text">
          {t("description")}
        </p>
      </div>

      {data.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-center">
          <p className="text-body text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="h-48 min-w-0 w-full">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={192}
          >
            <LineChart
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
                domain={[0, 100]}
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                tickLine={false}
                width={36}
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
                  paddingTop: 8,
                }}
              />
              <Line
                type="monotone"
                dataKey="standardPbi"
                name={t("standardPbi")}
                stroke="var(--info)"
                strokeDasharray="4 3"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "var(--info)" }}
              />
              <Line
                type="monotone"
                dataKey="personalizedPbi"
                name={t("personalizedPbi")}
                stroke="hsl(var(--chart-1))"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "hsl(var(--chart-1))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
