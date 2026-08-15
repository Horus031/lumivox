"use client";

import { useTranslations } from "next-intl";
import {
  CartesianGrid,
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
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <p className="mt-1 text-sm text-neutral-600">{t("description")}</p>
      </div>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-neutral-600">{t("empty")}</p>
        </div>
      ) : (
        <div className="h-85 w-full">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={320}
            minHeight={340}
          >
            <LineChart
              data={data}
              margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--chart-grid))"
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "hsl(var(--chart-axis))" }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "hsl(var(--chart-axis))" }}
              />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="standardPbi"
                name={t("standardPbi")}
                stroke="hsl(var(--chart-1))"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "hsl(var(--chart-1))" }}
              />
              <Line
                type="monotone"
                dataKey="personalizedPbi"
                name={t("personalizedPbi")}
                stroke="hsl(var(--chart-3))"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "hsl(var(--chart-3))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
