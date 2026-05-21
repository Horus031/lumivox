"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
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

export function TaskStatusChart({ data }: TaskStatusChartProps) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-semibold">Task status overview</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Current distribution of task states across the system.
        </p>
      </div>

      <div className="h-85 w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={320}
          minHeight={340}
        >
          <BarChart
            data={data}
            margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
            <XAxis
              dataKey="status"
              tick={{ fill: "hsl(var(--chart-axis))" }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "hsl(var(--chart-axis))" }}
            />
            <Tooltip />
            <Bar
              dataKey="count"
              name="Tasks"
              fill="hsl(var(--chart-1))"
              radius={[10, 10, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
