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
import type { FieldPhysicsSeriesPoint } from "@/lib/sdl/fieldDataset";

export function FieldLossProfileChart({ series }: { series: FieldPhysicsSeriesPoint[] }) {
  const first = series[0];
  if (!first) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Profil data lapangan belum tersedia.
      </div>
    );
  }

  const peak = series.reduce(
    (best, point) => (point.technical_loss_kw > best.technical_loss_kw ? point : best),
    first,
  );

  return (
    <div className="relative h-full w-full" data-field-loss-chart="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 10, right: 14, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="fieldLossFill" x1="0" y1="0" x2="0" y2="1">
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
            tickFormatter={(value: number) => `${Number(value).toFixed(1)} kW`}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-border)", strokeDasharray: "3 3" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as FieldPhysicsSeriesPoint | undefined;
              if (!point) return null;
              return (
                <div className="min-w-52 rounded-lg border border-border bg-surface-2 p-2.5 text-[11px] shadow-lg" data-field-loss-tooltip="true">
                  <div className="font-semibold text-foreground">{String(label)}</div>
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-muted-foreground">
                    <span>Susut teknis</span><span className="numeric text-foreground">{point.technical_loss_kw.toFixed(3)} kW</span>
                    <span>Saluran</span><span className="numeric">{point.line_loss_kw.toFixed(3)} kW</span>
                    <span>Trafo</span><span className="numeric">{point.transformer_loss_kw.toFixed(3)} kW</span>
                    <span>Rasio susut</span><span className="numeric">{point.loss_rate_percent.toFixed(2)}%</span>
                    <span>Tegangan minimum</span><span className="numeric">{point.min_voltage_pu.toFixed(3)} pu</span>
                    <span>Loading maksimum</span><span className="numeric">{point.max_loading_percent.toFixed(1)}%</span>
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="technical_loss_kw"
            name="Susut teknis"
            stroke="var(--color-chart-1)"
            fill="url(#fieldLossFill)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3.5 }}
          />
          <Line
            type="monotone"
            dataKey="line_loss_kw"
            name="Saluran"
            stroke="var(--color-chart-2)"
            strokeWidth={1.2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="transformer_loss_kw"
            name="Trafo"
            stroke="var(--color-warn)"
            strokeWidth={1.2}
            dot={false}
          />
          <ReferenceDot
            x={peak.time}
            y={peak.technical_loss_kw}
            r={3.7}
            fill="var(--color-chart-1)"
            stroke="var(--color-surface)"
            strokeWidth={1.5}
            ifOverflow="extendDomain"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
