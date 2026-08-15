import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LossSeriesPoint, SeriesPoint } from "@/lib/sdl/types";
import { summarizeLossSeries } from "@/lib/sdl/operation";

type ChartPoint = LossSeriesPoint | SeriesPoint;

export function LossProfileChart({ series }: { series: ChartPoint[] }) {
  const summary = summarizeLossSeries(series);

  if (!series.length) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Profil susut 24 jam (96 interval) tampil setelah analisis dijalankan.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={series} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="smartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--grid-line)" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          interval={11}
          tickLine={false}
          axisLine={{ stroke: "var(--color-border)" }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={54}
          tickFormatter={(v: number) => `${Number(v).toFixed(1)} kW`}
        />
        <Tooltip
          cursor={{ stroke: "var(--color-border)", strokeDasharray: "3 3" }}
          contentStyle={{
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 11,
          }}
          labelStyle={{ color: "var(--color-foreground)", fontWeight: 600 }}
          labelFormatter={(label) => `Waktu ${String(label)}`}
          formatter={(value, name) => [
            `${Number(value ?? 0).toFixed(3)} kW`,
            String(name ?? ""),
          ]}
        />
        <Area
          type="monotone"
          dataKey="smart_loss_kw"
          name="Smart loss"
          stroke="var(--color-chart-1)"
          fill="url(#smartFill)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3.5 }}
        />
        <Line
          type="monotone"
          dataKey="conventional_loss_kw"
          name="Konvensional"
          stroke="var(--color-chart-2)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          activeDot={{ r: 3 }}
        />
        {summary.peakSmartKw != null && summary.peakTime != null && (
          <ReferenceDot
            x={summary.peakTime}
            y={summary.peakSmartKw}
            r={3.5}
            fill="var(--color-chart-1)"
            stroke="var(--color-surface)"
            strokeWidth={1.5}
            ifOverflow="extendDomain"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
