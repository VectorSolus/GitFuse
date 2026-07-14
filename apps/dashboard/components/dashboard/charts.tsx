"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type SeriesPoint = {
  label: string;
  value: number;
};

export function HistoryBarChart({ data }: { data: SeriesPoint[] }) {
  return (
    <div className="gf-chart gf-chart-dark">
      <ResponsiveContainer height={200} width="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
          <XAxis dataKey="label" stroke="#CBD5E1" tickLine={false} />
          <YAxis allowDecimals={false} stroke="#CBD5E1" tickLine={false} width={32} />
          <Tooltip cursor={{ fill: "rgba(37, 99, 235, 0.18)" }} />
          <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function UsageRadial({
  label,
  current,
  max,
  color = "#2563EB"
}: {
  label: string;
  current: number;
  max: number;
  color?: string;
}) {
  const value = max <= 0 ? 0 : Math.min(100, Math.round((current / max) * 100));
  return (
    <section className="gf-card gf-radial-card">
      <div className="gf-radial">
        <ResponsiveContainer height={150} width="100%">
          <RadialBarChart cx="50%" cy="50%" data={[{ value }]} endAngle={-270} innerRadius="72%" outerRadius="96%" startAngle={90}>
            <RadialBar background dataKey="value" fill={color} cornerRadius={10} />
          </RadialBarChart>
        </ResponsiveContainer>
        <strong>{current}</strong>
      </div>
      <span>{label}</span>
      <p>
        {current} of {max} used
      </p>
    </section>
  );
}

export function BundleSizeLineChart({ data }: { data: SeriesPoint[] }) {
  return (
    <div className="gf-mini-chart">
      <ResponsiveContainer height={104} width="100%">
        <LineChart data={data}>
          <XAxis dataKey="label" hide />
          <YAxis hide />
          <Tooltip />
          <Line dataKey="value" dot={false} stroke="#2563EB" strokeWidth={2} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
