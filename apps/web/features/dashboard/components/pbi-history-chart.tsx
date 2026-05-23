"use client";

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
  return (
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-semibold">PBI history</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Track how Standard and Personalized PBI evolve across snapshots.
        </p>
      </div>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-neutral-600">
            No historical PBI snapshots available yet.
          </p>
        </div>
      ) : (
        <div className="h-85 w-full">
          <ResponsiveContainer width={'100%'} height={'100%'} minWidth={320} minHeight={340}>
            <LineChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis dataKey="label" tick={{ fill: "hsl(var(--chart-axis))" }} />
              <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--chart-axis))" }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="standardPbi"
                name="Standard PBI"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "hsl(var(--chart-1))" }}
              />
              <Line
                type="monotone"
                dataKey="personalizedPbi"
                name="Personalized PBI"
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