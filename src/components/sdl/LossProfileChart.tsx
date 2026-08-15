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

function signedKw(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)} kW`;
}

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
      <AreaChart data={series} margin={{ top: 12, right: 14, left: 4, bottom: 0 }}>
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
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0]?.payload as ChartPoint | undefined;
            if (!point) return null;
            const smart = Number(point.smart_loss_kw);
            const conventional = Number(point.conventional_loss_kw);
            const delta = smart - conventional;
            const isPeak = summary.peakTime === point.time;
            const isWorst = summary.worstTime === point.time;
            const insight =
              Math.abs(delta) < 0.005
                ? "Smart dan konvensional hampir sama pada interval ini."
                : delta < 0
                  ? `Smart ${Math.abs(delta).toFixed(3)} kW lebih rendah dari konvensional.`
                  : `Smart ${Math.abs(delta).toFixed(3)} kW lebih tinggi dari konvensional.`;

            return (
              <div className="min-w-52 rounded-lg border border-border bg-surface-2 p-2.5 text-[11px] shadow-lg" data-loss-tooltip="true">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-semibold text-foreground">{String(label)}</span>
                  {(isPeak || isWorst) && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-warn">
                      {isPeak && isWorst ? "Peak · worst gap" : isPeak ? "Peak loss" : "Worst gap"}
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-muted-foreground">
                  <span>Smart engine</span><span className="numeric text-foreground">{smart.toFixed(3)} kW</span>
                  <span>Konvensional</span><span className="numeric">{conventional.toFixed(3)} kW</span>
                  <span>Δ model</span><span className="numeric">{signedKw(delta)}</span>
                </div>
                <p className="mt-2 border-t border-border/60 pt-2 leading-relaxed text-muted-foreground">{insight}</p>
              </div>
            );
          }}
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
            r={3.7}
            fill="var(--color-chart-1)"
            stroke="var(--color-surface)"
            strokeWidth={1.5}
            ifOverflow="extendDomain"
            data-testid="peak-interval-dot"
          />
        )}
        {summary.worstTime != null && summary.worstSmartKw != null && summary.worstTime !== summary.peakTime && (
          <ReferenceDot
            x={summary.worstTime}
            y={summary.worstSmartKw}
            r={3.3}
            fill="var(--color-warn)"
            stroke="var(--color-surface)"
            strokeWidth={1.5}
            ifOverflow="extendDomain"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
