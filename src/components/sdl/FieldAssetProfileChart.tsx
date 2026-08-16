import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FieldSelectedView } from "@/lib/sdl/fieldAsset";

export function FieldAssetProfileChart({ view }: { view: FieldSelectedView }) {
  if (view.kind === "source") return <SourceChart view={view} />;
  if (view.kind === "bus") return <BusChart view={view} />;
  return <ElementChart view={view} />;
}

function SourceChart({ view }: { view: FieldSelectedView }) {
  if (!view.totalSeries.length) return <Empty />;
  return (
    <div className="relative h-full w-full" data-field-asset-chart="source">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={view.totalSeries} margin={{ top: 8, right: 14, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="p5SourceLoss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Grid />
          <Axis unit="kW" />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0]?.payload as FieldSelectedView["totalSeries"][number] | undefined;
            if (!point) return null;
            return <Tip label={String(label)} rows={[
              ["Susut total", `${point.technical_loss_kw.toFixed(3)} kW`],
              ["Saluran", `${point.line_loss_kw.toFixed(3)} kW`],
              ["Trafo", `${point.transformer_loss_kw.toFixed(3)} kW`],
              ["Loading maks.", `${point.max_loading_percent.toFixed(1)}%`],
            ]} />;
          }} />
          <Area type="monotone" dataKey="technical_loss_kw" stroke="var(--color-chart-1)" fill="url(#p5SourceLoss)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="line_loss_kw" stroke="var(--color-chart-2)" strokeWidth={1.1} dot={false} />
          <Line type="monotone" dataKey="transformer_loss_kw" stroke="var(--color-warn)" strokeWidth={1.1} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ElementChart({ view }: { view: FieldSelectedView }) {
  if (!view.assetSeries.length) return <Empty />;
  return (
    <div className="relative h-full w-full" data-field-asset-chart="element">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={view.assetSeries} margin={{ top: 8, right: 14, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="p5ElementLoss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Grid />
          <Axis unit="kW" />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0]?.payload as FieldSelectedView["assetSeries"][number] | undefined;
            if (!point) return null;
            return <Tip label={String(label)} rows={[
              ["Susut aset", `${point.loss_kw.toFixed(3)} kW`],
              ["Loading", `${point.loading_percent.toFixed(1)}%`],
              ["V from", point.from_vm_min_pu == null ? "—" : `${point.from_vm_min_pu.toFixed(3)} pu`],
              ["V to", point.to_vm_min_pu == null ? "—" : `${point.to_vm_min_pu.toFixed(3)} pu`],
            ]} />;
          }} />
          <Area type="monotone" dataKey="loss_kw" stroke="var(--color-chart-1)" fill="url(#p5ElementLoss)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function BusChart({ view }: { view: FieldSelectedView }) {
  if (!view.busSeries.length) return <Empty />;
  return (
    <div className="relative h-full w-full" data-field-asset-chart="bus">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={view.busSeries} margin={{ top: 8, right: 14, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="p5BusVoltage" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Grid />
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} interval={11} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} />
          <YAxis domain={["dataMin - 0.01", "dataMax + 0.01"]} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={52} tickFormatter={(value: number) => `${Number(value).toFixed(2)} pu`} />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0]?.payload as FieldSelectedView["busSeries"][number] | undefined;
            if (!point) return null;
            return <Tip label={String(label)} rows={[
              ["V minimum", `${point.vm_min_pu.toFixed(3)} pu`],
              ["V rata-rata", `${point.vm_avg_pu.toFixed(3)} pu`],
              ["V maksimum", `${point.vm_max_pu.toFixed(3)} pu`],
              ["Beban bus", `${point.load_kw.toFixed(2)} kW`],
            ]} />;
          }} />
          <Area type="monotone" dataKey="vm_min_pu" stroke="var(--color-chart-1)" fill="url(#p5BusVoltage)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="vm_avg_pu" stroke="var(--color-chart-2)" strokeWidth={1.1} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Grid() {
  return <CartesianGrid stroke="var(--grid-line)" vertical={false} />;
}

function Axis({ unit }: { unit: string }) {
  return <>
    <XAxis dataKey="time" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} interval={11} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} />
    <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={54} tickFormatter={(value: number) => `${Number(value).toFixed(1)} ${unit}`} />
  </>;
}

function Tip({ label, rows }: { label: string; rows: Array<[string, string]> }) {
  return (
    <div className="min-w-48 rounded-lg border border-border bg-surface-2 p-2.5 text-[11px] shadow-lg">
      <div className="font-semibold text-foreground">{label}</div>
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-muted-foreground">
        {rows.map(([name, value]) => <div className="contents" key={name}><span>{name}</span><span className="numeric text-foreground">{value}</span></div>)}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Profil aset belum tersedia.</div>;
}
