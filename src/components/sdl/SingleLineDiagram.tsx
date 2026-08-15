import { cn } from "@/lib/utils";
import type { AssetId } from "@/lib/sdl/derive";

interface Props {
  selected: AssetId;
  onSelect: (id: AssetId) => void;
  energised: boolean;
  intensity: number;
  gdLossKwh: number | null;
  mvLossKwh: number | null;
}

const HOT = "var(--color-warn)";

function CircuitBreaker({ x, y, label }: { x: number; y: number; label: string }) {
  const size = 18;
  const half = size / 2;
  return (
    <g aria-label={label}>
      <rect
        x={x - half}
        y={y - half}
        width={size}
        height={size}
        rx="1.5"
        fill="var(--color-surface)"
        stroke="currentColor"
        strokeWidth="1.55"
      />
      <path
        d={`M${x - 5.2} ${y - 5.2}L${x + 5.2} ${y + 5.2}M${x + 5.2} ${y - 5.2}L${x - 5.2} ${y + 5.2}`}
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <text
        x={x}
        y={y - 14}
        textAnchor="middle"
        fill="var(--color-muted-foreground)"
        fontSize="8.2"
        fontFamily="var(--font-mono)"
      >
        {label}
      </text>
    </g>
  );
}

function MeterSymbol({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="10" fill="var(--color-surface)" stroke="currentColor" strokeWidth="1.5" />
      <text x={x} y={y + 2.8} textAnchor="middle" fill="currentColor" fontSize="7.6" fontFamily="var(--font-mono)">
        M
      </text>
      <text x={x + 16} y={y + 2.5} fill="var(--color-muted-foreground)" fontSize="8.2" fontFamily="var(--font-mono)">
        {label}
      </text>
    </g>
  );
}

function LoadSymbol({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x - 10} ${y - 9}H${x + 10}L${x} ${y + 9}Z`}
      fill="var(--color-surface)"
      stroke="currentColor"
      strokeWidth="1.55"
    />
  );
}

function RouteRail({ d, width = 2.1 }: { d: string; width?: number }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.9"
      pointerEvents="none"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function FlowPath({ d, fast, width = 1.7 }: { d: string; fast: boolean; width?: number }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={fast ? "flow-dash" : "flow-dash-slow"}
      pointerEvents="none"
      vectorEffect="non-scaling-stroke"
    />
  );
}

export function SingleLineDiagram({
  selected,
  onSelect,
  energised,
  intensity,
  gdLossKwh,
  mvLossKwh,
}: Props) {
  const fastFlow = intensity > 0.6;

  const zone = (id: AssetId) =>
    cn(
      "cursor-pointer transition-opacity duration-150",
      selected === id || selected === "feeder" ? "opacity-100" : "opacity-[0.94] hover:opacity-100",
    );

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg">
      <div className="cockpit-grid absolute inset-0 opacity-35" />
      <svg
        viewBox="0 0 1040 470"
        className="relative h-full w-full"
        role="img"
        aria-label="Single line diagram penyulang 20 kV, pelanggan tegangan menengah, gardu distribusi 20/0.4 kV, dan tiga JTR"
        shapeRendering="geometricPrecision"
      >
        <defs>
          <filter id="flowGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.15" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Upstream source */}
        <g color="var(--color-mv)">
          <rect x="24" y="58" width="144" height="70" rx="7" fill="var(--color-surface-2)" stroke="var(--color-border)" />
          <circle cx="55" cy="93" r="14" fill="var(--color-surface)" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M46 93C48.5 86.5 51.5 99.5 54.5 93S60.5 86.5 64 93"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinecap="round"
          />
          <text x="80" y="87" fill="var(--color-foreground)" fontSize="12.5" fontFamily="var(--font-display)">
            GI 150/20 kV
          </text>
          <text x="80" y="104" fill="var(--color-muted-foreground)" fontSize="9.5">
            Grid / upstream source
          </text>

          <RouteRail d="M168 93H207" width={2.15} />
          <CircuitBreaker x={216} y={93} label="QF-01 / PMT" />
          <RouteRail d="M225 93H260" width={2.15} />
          {energised && (
            <g filter="url(#flowGlow)">
              <FlowPath d="M168 93H207" fast={fastFlow} />
              <FlowPath d="M225 93H260" fast={fastFlow} />
            </g>
          )}
        </g>

        {/* Main 20 kV feeder: static topology always visible; live current is overlay only. */}
        <g className={zone("feeder")} onClick={() => onSelect("feeder")} color="var(--color-mv)">
          <RouteRail d="M260 93H955" width={3.0} />
          <text x="266" y="76" fill="currentColor" fontSize="10.3" fontFamily="var(--font-mono)">
            BUS 20 kV · PENYULANG GD-01 · 3Φ
          </text>
          {energised && (
            <g filter="url(#flowGlow)">
              <FlowPath d="M260 93H390" fast={fastFlow} width={1.85} />
              <FlowPath d="M390 93H600" fast={fastFlow} width={1.85} />
              <FlowPath d="M600 93H840" fast={fastFlow} width={1.85} />
              <FlowPath d="M840 93H955" fast={fastFlow} width={1.85} />
            </g>
          )}
        </g>

        {/* Spot MV */}
        <g className={zone("spot")} onClick={() => onSelect("spot")} color="var(--color-mv)">
          <RouteRail d="M390 93V136" width={1.8} />
          <CircuitBreaker x={390} y={145} label="QF-11" />
          <RouteRail d="M390 154V184" width={1.8} />
          <MeterSymbol x={390} y={194} label="AMI" />
          <RouteRail d="M390 204V231" width={1.8} />
          <LoadSymbol x={390} y={242} />
          {energised && (
            <g filter="url(#flowGlow)">
              <FlowPath d="M390 93V136" fast={fastFlow} width={1.5} />
              <FlowPath d="M390 154V184" fast={fastFlow} width={1.5} />
              <FlowPath d="M390 204V231" fast={fastFlow} width={1.5} />
            </g>
          )}
          <rect x="302" y="266" width="176" height="40" rx="6" fill="var(--color-surface-2)" stroke={selected === "spot" ? "var(--color-primary)" : "var(--color-border)"} />
          <text x="314" y="282" fill="var(--color-foreground)" fontSize="11" fontFamily="var(--font-display)">
            Spot load TM
          </text>
          <text x="314" y="296" fill="var(--color-muted-foreground)" fontSize="9" fontFamily="var(--font-mono)">
            OBS 100% · {mvLossKwh == null ? "susut —" : `susut ${mvLossKwh.toFixed(2)} kWh/hari`}
          </text>
        </g>

        {/* Pelanggan TM */}
        <g className={zone("tm")} onClick={() => onSelect("tm")} color="var(--color-mv)">
          <RouteRail d="M600 93V136" width={1.8} />
          <CircuitBreaker x={600} y={145} label="QF-21" />
          <RouteRail d="M600 154V184" width={1.8} />
          <MeterSymbol x={600} y={194} label="kWh" />
          <RouteRail d="M600 204V231" width={1.8} />
          <LoadSymbol x={600} y={242} />
          {energised && (
            <g filter="url(#flowGlow)">
              <FlowPath d="M600 93V136" fast={fastFlow} width={1.5} />
              <FlowPath d="M600 154V184" fast={fastFlow} width={1.5} />
              <FlowPath d="M600 204V231" fast={fastFlow} width={1.5} />
            </g>
          )}
          <rect x="512" y="266" width="176" height="40" rx="6" fill="var(--color-surface-2)" stroke={selected === "tm" ? "var(--color-primary)" : "var(--color-border)"} />
          <text x="524" y="282" fill="var(--color-foreground)" fontSize="11" fontFamily="var(--font-display)">
            Pelanggan TM
          </text>
          <text x="524" y="296" fill="var(--color-muted-foreground)" fontSize="9" fontFamily="var(--font-mono)">
            {mvLossKwh == null ? "meter interval · 15 menit" : `meter 15 menit · susut ${mvLossKwh.toFixed(2)} kWh/hari`}
          </text>
        </g>

        {/* Gardu distribusi */}
        <g className={zone("gd")} onClick={() => onSelect("gd")} color="var(--color-mv)">
          <RouteRail d="M840 93V127" width={2.0} />
          <CircuitBreaker x={840} y={136} label="QF-31" />
          <RouteRail d="M840 145V159" width={2.0} />
          <circle cx="840" cy="176" r="17" fill="var(--color-surface)" stroke="currentColor" strokeWidth="2" />
          <circle cx="840" cy="198" r="17" fill="var(--color-surface)" stroke="var(--color-lv)" strokeWidth="2" />
          {energised && <circle cx="840" cy="187" r="10" fill="var(--color-primary)" opacity="0.18" className="pulse-node" />}
          <text x="870" y="176" fill="var(--color-foreground)" fontSize="11.5" fontFamily="var(--font-display)">
            TR GD-01
          </text>
          <text x="870" y="191" fill="var(--color-muted-foreground)" fontSize="9.5" fontFamily="var(--font-mono)">
            400 kVA · 20/0.4 kV
          </text>
          <text x="870" y="205" fill={gdLossKwh == null ? "var(--color-muted-foreground)" : HOT} fontSize="9" fontFamily="var(--font-mono)">
            {gdLossKwh == null ? "susut —" : `susut ${gdLossKwh.toFixed(2)} kWh/hari`}
          </text>

          <g color="var(--color-lv)">
            <RouteRail d="M840 215V237" width={2.0} />
            <CircuitBreaker x={840} y={246} label="QF-LV" />
            <RouteRail d="M840 255V274" width={2.0} />
            <RouteRail d="M730 274H970" width={3.0} />
            {energised && (
              <g filter="url(#flowGlow)">
                <FlowPath d="M840 215V237" fast={fastFlow} width={1.55} />
                <FlowPath d="M840 255V274" fast={fastFlow} width={1.55} />
                <FlowPath d="M840 274H755" fast={fastFlow} width={1.8} />
                <FlowPath d="M840 274H945" fast={fastFlow} width={1.8} />
              </g>
            )}
          </g>
          <text x="730" y="260" fill="var(--color-lv)" fontSize="10" fontFamily="var(--font-mono)">
            BUSBAR 0.4 kV · 3Φ4W
          </text>

          {[
            { x: 755, name: "JTR-01", cust: 34, qf: "QF-41" },
            { x: 850, name: "JTR-02", cust: 30, qf: "QF-42" },
            { x: 945, name: "JTR-03", cust: 26, qf: "QF-43" },
          ].map((b) => (
            <g key={b.name} color="var(--color-lv)">
              <RouteRail d={`M${b.x} 274V305`} width={1.75} />
              <CircuitBreaker x={b.x} y={314} label={b.qf} />
              <RouteRail d={`M${b.x} 323V350`} width={1.75} />
              {energised && (
                <g filter="url(#flowGlow)">
                  <FlowPath d={`M${b.x} 274V305`} fast={false} width={1.45} />
                  <FlowPath d={`M${b.x} 323V350`} fast={false} width={1.45} />
                </g>
              )}
              <RouteRail d={`M${b.x - 28} 350H${b.x + 28}`} width={1.9} />
              <path d={`M${b.x - 18} 350V371M${b.x} 350V371M${b.x + 18} 350V371`} stroke="currentColor" strokeWidth="1.1" opacity="0.85" />
              <circle cx={b.x - 18} cy="378" r="4.6" fill="var(--color-surface-2)" stroke="currentColor" />
              <circle cx={b.x} cy="378" r="4.6" fill="var(--color-surface-2)" stroke="currentColor" />
              <circle cx={b.x + 18} cy="378" r="4.6" fill="var(--color-surface-2)" stroke="currentColor" />
              <text x={b.x} y="402" textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="9.2" fontFamily="var(--font-mono)">
                {b.name} · {b.cust} plg
              </text>
            </g>
          ))}
        </g>

        {/* Compact legend */}
        <g>
          <rect x="24" y="344" width="560" height="70" rx="8" fill="var(--color-surface)" stroke="var(--color-border)" />
          <text x="42" y="365" fill="var(--color-foreground)" fontSize="10.5" fontFamily="var(--font-display)">
            Konvensi SLD
          </text>
          <circle cx="45" cy="383" r="4" fill="var(--color-mv)" />
          <text x="57" y="387" fill="var(--color-muted-foreground)" fontSize="9.5">20 kV / TM</text>
          <circle cx="155" cy="383" r="4" fill="var(--color-lv)" />
          <text x="167" y="387" fill="var(--color-muted-foreground)" fontSize="9.5">0.4 kV / TR-JTR</text>
          <text x="275" y="387" fill="var(--color-muted-foreground)" fontSize="9.5">
            solid = topology · dash = current flow
          </text>
        </g>
      </svg>
    </div>
  );
}