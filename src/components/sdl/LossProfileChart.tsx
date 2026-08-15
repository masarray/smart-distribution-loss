import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/lib/sdl/types";

export function LossProfileChart({ series }: { series: SeriesPoint[] }) {
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
          <linearGradient id="truthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-4)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-chart-4)" stopOpacity={0} />
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
          contentStyle={{
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 11,
          }}
          labelStyle={{ color: "var(--color-muted-foreground)" }}
          formatter={(v: number, name: string) => [`${Number(v).toFixed(3)} kW`, name]}
        />
        <Area
          type="monotone"
          dataKey="truth_loss_kw"
          name="Ground truth"
          stroke="var(--color-chart-4)"
          fill="url(#truthFill)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="conventional_loss_kw"
          name="Konvensional"
          stroke="var(--color-chart-2)"
          strokeWidth={1.6}
          strokeDasharray="4 4"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="smart_loss_kw"
          name="Smart engine"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
