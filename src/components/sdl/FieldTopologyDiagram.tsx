import { useMemo } from "react";
import type { FieldAssetSummary } from "@/lib/sdl/fieldAsset";
import type { FieldTopologyGraph, FieldTopologySelection } from "@/lib/sdl/fieldTopology";
import { selectionKey } from "@/lib/sdl/fieldTopology";

interface Props {
  graph: FieldTopologyGraph;
  selected: FieldTopologySelection;
  onSelect: (selection: FieldTopologySelection) => void;
  assets: FieldAssetSummary[];
}

interface Point {
  x: number;
  y: number;
}

export function FieldTopologyDiagram({ graph, selected, onSelect, assets }: Props) {
  const layout = useMemo(() => buildLayout(graph), [graph]);
  const lossById = useMemo(() => new Map(assets.map((asset) => [asset.element_id, asset.loss_kwh])), [assets]);

  if (!graph.supported || !graph.source || !graph.rootBusId) {
    return (
      <div className="flex h-full items-center justify-center p-6" data-field-topology-unsupported="true">
        <div className="max-w-xl rounded-lg border border-warn/30 bg-warn/5 p-4 text-center">
          <p className="text-xs font-semibold text-warn">Topology tidak dirender</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {graph.reason ?? "Struktur jaringan belum memenuhi kontrak renderer radial P5."}
          </p>
        </div>
      </div>
    );
  }

  const activeKey = selectionKey(selected);
  const sourcePoint = layout.busPoints.get(graph.rootBusId) ?? { x: 210, y: 120 };
  const sourceSelection: FieldTopologySelection = { kind: "source", id: graph.source.element_id };

  return (
    <div className="h-full w-full overflow-hidden" data-field-dynamic-sld="true">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="h-full w-full"
        role="img"
        aria-label="Single line diagram topology data lapangan"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="p5SelectedGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g
          role="button"
          tabIndex={0}
          aria-label={`Pilih source ${graph.source.element_id}`}
          onClick={() => onSelect(sourceSelection)}
          onKeyDown={(event) => activateWithKeyboard(event, () => onSelect(sourceSelection))}
          className="cursor-pointer outline-none"
          data-field-topology-source={graph.source.element_id}
          data-selected={activeKey === selectionKey(sourceSelection) ? "true" : "false"}
        >
          <rect
            x={sourcePoint.x - 150}
            y={sourcePoint.y - 24}
            width={92}
            height={48}
            rx={8}
            fill={activeKey === selectionKey(sourceSelection) ? "var(--color-primary)" : "var(--color-surface-2)"}
            fillOpacity={activeKey === selectionKey(sourceSelection) ? 0.16 : 0.9}
            stroke={activeKey === selectionKey(sourceSelection) ? "var(--color-primary)" : "var(--color-border)"}
            filter={activeKey === selectionKey(sourceSelection) ? "url(#p5SelectedGlow)" : undefined}
          />
          <text x={sourcePoint.x - 104} y={sourcePoint.y - 4} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="9">SOURCE</text>
          <text x={sourcePoint.x - 104} y={sourcePoint.y + 11} textAnchor="middle" fill="var(--color-foreground)" fontSize="11" fontWeight="600">{graph.source.element_id}</text>
          <path d={`M ${sourcePoint.x - 58} ${sourcePoint.y} H ${sourcePoint.x - 18}`} stroke="var(--color-primary)" strokeWidth="2" />
        </g>

        {graph.elements.map((element) => {
          const from = layout.busPoints.get(element.from_bus);
          const to = layout.busPoints.get(element.to_bus);
          if (!from || !to) return null;
          const selection: FieldTopologySelection = { kind: "element", id: element.element_id };
          const selectedNow = activeKey === selectionKey(selection);
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          const loss = lossById.get(element.element_id);
          return (
            <g
              key={element.element_id}
              role="button"
              tabIndex={0}
              aria-label={`Pilih ${element.element_type} ${element.element_id}`}
              onClick={() => onSelect(selection)}
              onKeyDown={(event) => activateWithKeyboard(event, () => onSelect(selection))}
              className="cursor-pointer outline-none"
              data-field-topology-element={element.element_id}
              data-element-type={element.element_type}
              data-selected={selectedNow ? "true" : "false"}
            >
              <path
                d={`M ${from.x + 18} ${from.y} C ${midX - 30} ${from.y}, ${midX + 30} ${to.y}, ${to.x - 18} ${to.y}`}
                fill="none"
                stroke={selectedNow ? "var(--color-primary)" : element.element_type === "transformer" ? "var(--color-mv)" : "var(--color-border)"}
                strokeWidth={selectedNow ? 3 : 2}
                filter={selectedNow ? "url(#p5SelectedGlow)" : undefined}
              />
              {element.element_type === "transformer" ? (
                <g transform={`translate(${midX} ${midY})`}>
                  <circle cx={-7} cy={0} r={7} fill="var(--color-surface)" stroke={selectedNow ? "var(--color-primary)" : "var(--color-mv)"} strokeWidth="1.6" />
                  <circle cx={7} cy={0} r={7} fill="var(--color-surface)" stroke={selectedNow ? "var(--color-primary)" : "var(--color-lv)"} strokeWidth="1.6" />
                </g>
              ) : (
                <circle cx={midX} cy={midY} r={4} fill={selectedNow ? "var(--color-primary)" : "var(--color-surface-2)"} stroke={selectedNow ? "var(--color-primary)" : "var(--color-border)"} />
              )}
              <rect x={midX - 42} y={midY - 31} width={84} height={16} rx={4} fill="var(--color-surface)" fillOpacity={0.92} />
              <text x={midX} y={midY - 20} textAnchor="middle" fill={selectedNow ? "var(--color-primary)" : "var(--color-foreground)"} fontSize="9.5" fontWeight="600">
                {element.element_id}
              </text>
              {loss != null && (
                <text x={midX} y={midY + 28} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="8.5">
                  {loss.toFixed(2)} kWh
                </text>
              )}
            </g>
          );
        })}

        {graph.buses.map((bus) => {
          const point = layout.busPoints.get(bus.id);
          if (!point) return null;
          const selection: FieldTopologySelection = { kind: "bus", id: bus.id };
          const selectedNow = activeKey === selectionKey(selection);
          return (
            <g
              key={bus.id}
              role="button"
              tabIndex={0}
              aria-label={`Pilih bus ${bus.id}`}
              onClick={() => onSelect(selection)}
              onKeyDown={(event) => activateWithKeyboard(event, () => onSelect(selection))}
              className="cursor-pointer outline-none"
              data-field-topology-bus={bus.id}
              data-selected={selectedNow ? "true" : "false"}
            >
              <line
                x1={point.x - 17}
                y1={point.y}
                x2={point.x + 17}
                y2={point.y}
                stroke={selectedNow ? "var(--color-primary)" : bus.kv != null && bus.kv >= 1 ? "var(--color-mv)" : "var(--color-lv)"}
                strokeWidth={selectedNow ? 5 : 3.5}
                strokeLinecap="round"
                filter={selectedNow ? "url(#p5SelectedGlow)" : undefined}
              />
              <text x={point.x} y={point.y - 11} textAnchor="middle" fill={selectedNow ? "var(--color-primary)" : "var(--color-foreground)"} fontSize="9.5" fontWeight="600">
                {bus.id}
              </text>
              <text x={point.x} y={point.y + 17} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="8.5">
                {bus.kv == null ? "bus" : `${formatKv(bus.kv)} kV`}{bus.customers ? ` · ${bus.customers} plg` : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function buildLayout(graph: FieldTopologyGraph) {
  const busPoints = new Map<string, Point>();
  if (!graph.supported || !graph.rootBusId) return { busPoints, width: 760, height: 280 };
  const outgoing = new Map<string, Array<{ to_bus: string }>>();
  for (const element of graph.elements) {
    const list = outgoing.get(element.from_bus) ?? [];
    list.push(element);
    outgoing.set(element.from_bus, list);
  }

  const yByBus = new Map<string, number>();
  let leaf = 0;
  const assignY = (bus: string): number => {
    const children = outgoing.get(bus) ?? [];
    if (!children.length) {
      const y = 66 + leaf * 78;
      leaf += 1;
      yByBus.set(bus, y);
      return y;
    }
    const childYs = children.map((element) => assignY(element.to_bus));
    const y = childYs.reduce((sum, value) => sum + value, 0) / childYs.length;
    yByBus.set(bus, y);
    return y;
  };
  assignY(graph.rootBusId);

  for (const bus of graph.buses) {
    busPoints.set(bus.id, {
      x: 210 + bus.depth * 175,
      y: yByBus.get(bus.id) ?? 66,
    });
  }
  const width = Math.max(760, 300 + (graph.maxDepth + 1) * 175);
  const height = Math.max(270, 110 + Math.max(1, leaf) * 78);
  return { busPoints, width, height };
}

function activateWithKeyboard(event: React.KeyboardEvent<SVGGElement>, activate: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    activate();
  }
}

function formatKv(value: number) {
  return value >= 10 ? value.toFixed(0) : value.toFixed(value >= 1 ? 1 : 2);
}
