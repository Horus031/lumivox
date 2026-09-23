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
    <section className="flex h-full min-h-80 flex-col rounded-2xl bg-card/90 p-4 shadow-[0_16px_50px_-40px_hsl(var(--primary)/0.55)]">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t("description")}
        </p>
      </div>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-neutral-600">{t("empty")}</p>
        </div>
      ) : (
        <div className="min-h-52 w-full flex-1">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={208}
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
                tick={{ fill: "hsl(var(--chart-axis))", fontSize: 10 }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "hsl(var(--chart-axis))", fontSize: 10 }}
                tickLine={false}
                width={30}
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
                  fontSize: 11,
                  paddingTop: 8,
                }}
              />
              <Line
                type="monotone"
                dataKey="standardPbi"
                name={t("standardPbi")}
                stroke="hsl(var(--chart-2))"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "hsl(var(--chart-2))" }}
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
