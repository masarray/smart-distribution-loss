import { useMemo } from "react";
import type { FieldAssetSummary } from "@/lib/sdl/fieldAsset";
import type { FieldTopologyGraph, FieldTopologySelection } from "@/lib/sdl/fieldTopology";
import { getTopologyPathElementIds, selectionKey } from "@/lib/sdl/fieldTopology";

interface Props {
  graph: FieldTopologyGraph;
  selected: FieldTopologySelection;
  onSelect: (selection: FieldTopologySelection) => void;
  assets: FieldAssetSummary[];
  focusSelected?: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface Layout {
  busPoints: Map<string, Point>;
  elementPoints: Map<string, Point>;
  width: number;
  height: number;
}

export function FieldTopologyDiagram({ graph, selected, onSelect, assets, focusSelected = false }: Props) {
  const layout = useMemo(() => buildLayout(graph), [graph]);
  const lossById = useMemo(() => new Map(assets.map((asset) => [asset.element_id, asset.loss_kwh])), [assets]);
  const routeElements = useMemo(() => getTopologyPathElementIds(graph, selected), [graph, selected]);

  if (!graph.supported || !graph.source || !graph.rootBusId) {
    return (
      <div className="flex h-full items-center justify-center p-6" data-field-topology-unsupported="true">
        <div className="max-w-xl rounded-lg border border-warn/30 bg-warn/5 p-4 text-center">
          <p className="text-xs font-semibold text-warn">Topology tidak dirender</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {graph.reason ?? "Struktur jaringan belum memenuhi kontrak renderer radial."}
          </p>
        </div>
      </div>
    );
  }

  const activeKey = selectionKey(selected);
  const sourcePoint = layout.busPoints.get(graph.rootBusId) ?? { x: 210, y: 120 };
  const sourceSelection: FieldTopologySelection = { kind: "source", id: graph.source.element_id };
  const viewBox = focusSelected ? focusViewBox(layout, graph, selected, sourcePoint) : `0 0 ${layout.width} ${layout.height}`;

  return (
    <div
      className="h-full w-full overflow-hidden"
      data-field-dynamic-sld="true"
      data-field-sld-view={focusSelected ? "focus" : "fit"}
      data-field-layout-leaves={graph.leafBusIds.length}
      data-field-layout-branches={graph.branchBusIds.length}
    >
      <svg
        viewBox={viewBox}
        className="h-full w-full"
        role="img"
        aria-label="Single line diagram topology data lapangan"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="p6SelectedGlow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="4.6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="p6FlowGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
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
            filter={activeKey === selectionKey(sourceSelection) ? "url(#p6SelectedGlow)" : undefined}
          />
          <text x={sourcePoint.x - 104} y={sourcePoint.y - 4} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="9">SOURCE</text>
          <text x={sourcePoint.x - 104} y={sourcePoint.y + 11} textAnchor="middle" fill="var(--color-foreground)" fontSize="11" fontWeight="600">{graph.source.element_id}</text>
          <path d={`M ${sourcePoint.x - 58} ${sourcePoint.y} H ${sourcePoint.x - 18}`} stroke="var(--color-primary)" strokeWidth="2" />
          <path
            d={`M ${sourcePoint.x - 58} ${sourcePoint.y} H ${sourcePoint.x - 18}`}
            className="field-flow-path field-flow-path-active"
            data-field-flow-source="true"
            filter="url(#p6FlowGlow)"
          />
        </g>

        {graph.elements.map((element) => {
          const from = layout.busPoints.get(element.from_bus);
          const to = layout.busPoints.get(element.to_bus);
          if (!from || !to) return null;
          const selection: FieldTopologySelection = { kind: "element", id: element.element_id };
          const selectedNow = activeKey === selectionKey(selection);
          const routeNow = routeElements.has(element.element_id);
          const mid = layout.elementPoints.get(element.element_id) ?? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
          const loss = lossById.get(element.element_id);
          const d = `M ${from.x + 18} ${from.y} C ${mid.x - 30} ${from.y}, ${mid.x + 30} ${to.y}, ${to.x - 18} ${to.y}`;
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
              data-field-element-loss-kwh={loss == null ? undefined : loss.toFixed(6)}
              data-element-type={element.element_type}
              data-selected={selectedNow ? "true" : "false"}
            >
              {routeNow && (
                <path
                  d={d}
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth={selectedNow ? 8 : 6}
                  strokeLinecap="round"
                  opacity={selectedNow ? 0.19 : 0.1}
                  filter="url(#p6FlowGlow)"
                  pointerEvents="none"
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={selectedNow ? "var(--color-primary)" : element.element_type === "transformer" ? "var(--color-mv)" : "var(--color-border)"}
                strokeWidth={selectedNow ? 3 : 2}
                filter={selectedNow ? "url(#p6SelectedGlow)" : undefined}
              />
              <path
                d={d}
                className={selectedNow ? "field-flow-path field-flow-path-active" : routeNow ? "field-flow-path field-flow-path-route" : "field-flow-path"}
                data-field-flow-path={element.element_id}
                data-flow-route={routeNow ? "true" : "false"}
                data-flow-selected={selectedNow ? "true" : "false"}
                filter={selectedNow || routeNow ? "url(#p6FlowGlow)" : undefined}
              />
              {element.element_type === "transformer" ? (
                <g transform={`translate(${mid.x} ${mid.y})`}>
                  <circle cx={-7} cy={0} r={7} fill="var(--color-surface)" stroke={selectedNow ? "var(--color-primary)" : "var(--color-mv)"} strokeWidth="1.6" />
                  <circle cx={7} cy={0} r={7} fill="var(--color-surface)" stroke={selectedNow ? "var(--color-primary)" : "var(--color-lv)"} strokeWidth="1.6" />
                </g>
              ) : (
                <circle cx={mid.x} cy={mid.y} r={4} fill={selectedNow ? "var(--color-primary)" : "var(--color-surface-2)"} stroke={selectedNow ? "var(--color-primary)" : "var(--color-border)"} />
              )}
              <rect x={mid.x - 42} y={mid.y - 31} width={84} height={16} rx={4} fill="var(--color-surface)" fillOpacity={0.92} />
              <text x={mid.x} y={mid.y - 20} textAnchor="middle" fill={selectedNow ? "var(--color-primary)" : "var(--color-foreground)"} fontSize="9.5" fontWeight="600">
                {element.element_id}
              </text>
              {loss != null && (
                <text x={mid.x} y={mid.y + 28} textAnchor="middle" fill={routeNow ? "var(--color-primary)" : "var(--color-muted-foreground)"} fontSize="8.5">
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
              {selectedNow && <circle cx={point.x} cy={point.y} r={14} fill="none" stroke="var(--color-primary)" strokeWidth="1" className="pulse-node" opacity="0.35" />}
              <line
                x1={point.x - 17}
                y1={point.y}
                x2={point.x + 17}
                y2={point.y}
                stroke={selectedNow ? "var(--color-primary)" : bus.kv != null && bus.kv >= 1 ? "var(--color-mv)" : "var(--color-lv)"}
                strokeWidth={selectedNow ? 5 : 3.5}
                strokeLinecap="round"
                filter={selectedNow ? "url(#p6SelectedGlow)" : undefined}
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

function buildLayout(graph: FieldTopologyGraph): Layout {
  const busPoints = new Map<string, Point>();
  const elementPoints = new Map<string, Point>();
  if (!graph.supported || !graph.rootBusId) return { busPoints, elementPoints, width: 760, height: 280 };

  const outgoing = new Map<string, Array<{ element_id: string; to_bus: string }>>();
  for (const element of graph.elements) {
    const list = outgoing.get(element.from_bus) ?? [];
    list.push(element);
    outgoing.set(element.from_bus, list);
  }

  const leafCount = Math.max(1, graph.leafBusIds.length);
  const verticalGap = leafCount > 18 ? 48 : leafCount > 10 ? 56 : leafCount > 5 ? 66 : 78;
  const horizontalGap = graph.maxDepth > 10 ? 145 : graph.maxDepth > 6 ? 155 : 175;
  const yByBus = new Map<string, number>();
  let leaf = 0;
  const assignY = (bus: string): number => {
    const children = outgoing.get(bus) ?? [];
    if (!children.length) {
      const y = 68 + leaf * verticalGap;
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
      x: 210 + bus.depth * horizontalGap,
      y: yByBus.get(bus.id) ?? 68,
    });
  }
  for (const element of graph.elements) {
    const from = busPoints.get(element.from_bus);
    const to = busPoints.get(element.to_bus);
    if (!from || !to) continue;
    elementPoints.set(element.element_id, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
  }

  const width = Math.max(760, 320 + (graph.maxDepth + 1) * horizontalGap);
  const height = Math.max(270, 116 + Math.max(1, leaf) * verticalGap);
  return { busPoints, elementPoints, width, height };
}

function focusViewBox(
  layout: Layout,
  graph: FieldTopologyGraph,
  selection: FieldTopologySelection,
  sourcePoint: Point,
) {
  const focus = selection.kind === "source"
    ? { x: sourcePoint.x - 72, y: sourcePoint.y }
    : selection.kind === "bus"
      ? layout.busPoints.get(selection.id)
      : layout.elementPoints.get(selection.id);
  if (!focus) return `0 0 ${layout.width} ${layout.height}`;

  const width = Math.min(layout.width, 620);
  const height = Math.min(layout.height, 340);
  const x = clamp(focus.x - width / 2, 0, Math.max(0, layout.width - width));
  const y = clamp(focus.y - height / 2, 0, Math.max(0, layout.height - height));
  return `${x} ${y} ${width} ${height}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
