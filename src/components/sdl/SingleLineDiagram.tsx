import { cn } from "@/lib/utils";
import type { AssetId } from "@/lib/sdl/derive";

interface Props {
  selected: AssetId;
  onSelect: (id: AssetId) => void;
  energised: boolean;
  intensity: number;
  gdLossKwh: number | null;
  mvLossKwh: number | null;
  tmLossKwh: number | null;
}

type BreakerState = "CLOSED" | "OPEN" | "UNKNOWN";
type FlowDirection = "right" | "down" | "left";

const HOT = "var(--color-warn)";

function CircuitBreaker({
  x,
  y,
  label,
  state = "CLOSED",
  statePlacement = "right",
}: {
  x: number;
  y: number;
  label: string;
  state?: BreakerState;
  statePlacement?: "right" | "bottom";
}) {
  const size = 18;
  const half = size / 2;
  const stateColor =
    state === "CLOSED"
      ? "var(--color-success)"
      : state === "OPEN"
        ? "var(--color-warn)"
        : "var(--color-muted-foreground)";

  return (
    <g aria-label={`${label} ${state}`}>
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
      <circle cx={x} cy={y - 4.5} r="1.25" fill="currentColor" />
      <circle cx={x} cy={y + 4.5} r="1.25" fill="currentColor" />
      {state === "CLOSED" ? (
        <path d={`M${x} ${y - 4.5}V${y + 4.5}`} stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      ) : state === "OPEN" ? (
        <path d={`M${x} ${y - 4.5}L${x + 4.5} ${y + 1.3}`} stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      ) : (
        <path d={`M${x - 4} ${y}H${x + 4}`} stroke="var(--color-muted-foreground)" strokeWidth="1.2" strokeDasharray="2 2" />
      )}
      <text
        x={x}
        y={y - 14}
        textAnchor="middle"
        fill="var(--color-muted-foreground)"
        fontSize="8.1"
        fontFamily="var(--font-mono)"
      >
        {label}
      </text>
      <text
        x={statePlacement === "right" ? x + 12.5 : x}
        y={statePlacement === "right" ? y + 2.4 : y + 21.5}
        textAnchor={statePlacement === "right" ? "start" : "middle"}
        fill={stateColor}
        fontSize="6.4"
        fontWeight="600"
        fontFamily="var(--font-mono)"
      >
        {state}
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

function FlowPath({ d, fast, width = 1.35 }: { d: string; fast: boolean; width?: number }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.7"
      className={fast ? "flow-dash" : "flow-dash-slow"}
      pointerEvents="none"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function FlowArrow({ x, y, direction }: { x: number; y: number; direction: FlowDirection }) {
  const rotation = direction === "right" ? 0 : direction === "down" ? 90 : 180;
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rotation})`}
      data-flow-arrow="true"
      aria-hidden="true"
      opacity="0.82"
      pointerEvents="none"
    >
      <path d="M-4 -3L0 0L-4 3" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

export function SingleLineDiagram({
  selected,
  onSelect,
  energised,
  intensity,
  gdLossKwh,
  mvLossKwh,
  tmLossKwh,
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
        aria-label="Single line diagram penyulang 20 kV, referensi TM, pelanggan tegangan menengah, gardu distribusi 20/0.4 kV, dan tiga JTR"
        shapeRendering="geometricPrecision"
      >
        <defs>
          <filter id="flowGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.65" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* M4 keeps M3 scale but redistributes the three load branches to use the left/middle canvas. */}
        <g transform="translate(-12 -7) scale(1.085)">
          {/* Upstream source: intentionally smaller than the operational topology. */}
          <g color="var(--color-mv)">
            <rect x="24" y="63" width="132" height="60" rx="7" fill="var(--color-surface-2)" stroke="var(--color-border)" />
            <circle cx="50" cy="93" r="12.5" fill="var(--color-surface)" stroke="currentColor" strokeWidth="1.7" />
            <path
              d="M42 93C44.3 87.2 47 98.8 49.7 93S55.2 87.2 58.3 93"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
            />
            <text x="72" y="87.5" fill="var(--color-foreground)" fontSize="11.7" fontFamily="var(--font-display)">
              GI 150/20 kV
            </text>
            <text x="72" y="102.5" fill="var(--color-muted-foreground)" fontSize="8.8">
              Incoming penyulang
            </text>

            <RouteRail d="M156 93H207" width={2.15} />
            <CircuitBreaker x={216} y={93} label="QF-01 / PMT" state="CLOSED" statePlacement="bottom" />
            <RouteRail d="M225 93H260" width={2.15} />
            {energised && (
              <g filter="url(#flowGlow)">
                <FlowPath d="M156 93H207" fast={fastFlow} />
                <FlowPath d="M225 93H260" fast={fastFlow} />
                <FlowArrow x={246} y={93} direction="right" />
              </g>
            )}
          </g>

          {/* Main 20 kV feeder: branch taps are redistributed to avoid right-heavy composition. */}
          <g className={zone("feeder")} onClick={() => onSelect("feeder")} color="var(--color-mv)">
            <RouteRail d="M260 93H900" width={2.4} />
            <text x="266" y="76" fill="currentColor" fontSize="10.2" fontFamily="var(--font-mono)">
              BUS 20 kV · PENYULANG GD-01 · 3Φ
            </text>
            {energised && (
              <g filter="url(#flowGlow)">
                <FlowPath d="M260 93H355" fast={fastFlow} width={1.3} />
                <FlowPath d="M355 93H530" fast={fastFlow} width={1.3} />
                <FlowPath d="M530 93H725" fast={fastFlow} width={1.3} />
                <FlowPath d="M725 93H900" fast={fastFlow} width={1.3} />
                <FlowArrow x={310} y={93} direction="right" />
                <FlowArrow x={445} y={93} direction="right" />
                <FlowArrow x={625} y={93} direction="right" />
                <FlowArrow x={815} y={93} direction="right" />
              </g>
            )}
          </g>

          {/* Referensi TM (internal channel: spot). */}
          <g transform="translate(-35 0)" className={zone("spot")} onClick={() => onSelect("spot")} color="var(--color-mv)">
            <RouteRail d="M390 93V136" width={1.8} />
            <CircuitBreaker x={390} y={145} label="QF-11" state="CLOSED" />
            <RouteRail d="M390 154V184" width={1.8} />
            <MeterSymbol x={390} y={194} label="AMI" />
            <RouteRail d="M390 204V231" width={1.8} />
            <LoadSymbol x={390} y={242} />
            {energised && (
              <g filter="url(#flowGlow)">
                <FlowPath d="M390 93V136" fast={fastFlow} width={1.2} />
                <FlowPath d="M390 154V184" fast={fastFlow} width={1.2} />
                <FlowPath d="M390 204V231" fast={fastFlow} width={1.2} />
                <FlowArrow x={390} y={220} direction="down" />
              </g>
            )}
            <rect x="302" y="258" width="176" height="40" rx="6" fill="var(--color-surface-2)" stroke={selected === "spot" ? "var(--color-primary)" : "var(--color-border)"} />
            <text x="314" y="274" fill="var(--color-foreground)" fontSize="11" fontFamily="var(--font-display)">
              Referensi TM
            </text>
            <text x="314" y="288" fill="var(--color-muted-foreground)" fontSize="8.8" fontFamily="var(--font-mono)">
              Terukur penuh · {mvLossKwh == null ? "susut —" : `susut ${mvLossKwh.toFixed(2)} kWh/hari`}
            </text>
          </g>

          {/* Pelanggan TM */}
          <g transform="translate(-70 0)" className={zone("tm")} onClick={() => onSelect("tm")} color="var(--color-mv)">
            <RouteRail d="M600 93V136" width={1.8} />
            <CircuitBreaker x={600} y={145} label="QF-21" state="CLOSED" />
            <RouteRail d="M600 154V184" width={1.8} />
            <MeterSymbol x={600} y={194} label="kWh" />
            <RouteRail d="M600 204V231" width={1.8} />
            <LoadSymbol x={600} y={242} />
            {energised && (
              <g filter="url(#flowGlow)">
                <FlowPath d="M600 93V136" fast={fastFlow} width={1.2} />
                <FlowPath d="M600 154V184" fast={fastFlow} width={1.2} />
                <FlowPath d="M600 204V231" fast={fastFlow} width={1.2} />
                <FlowArrow x={600} y={220} direction="down" />
              </g>
            )}
            <rect x="512" y="258" width="176" height="40" rx="6" fill="var(--color-surface-2)" stroke={selected === "tm" ? "var(--color-primary)" : "var(--color-border)"} />
            <text x="524" y="274" fill="var(--color-foreground)" fontSize="11" fontFamily="var(--font-display)">
              Pelanggan TM
            </text>
            <text x="524" y="288" fill="var(--color-muted-foreground)" fontSize="8.8" fontFamily="var(--font-mono)">
              {tmLossKwh == null ? "Meter 15 menit · susut —" : `Meter 15 menit · susut ${tmLossKwh.toFixed(2)} kWh/hari`}
            </text>
          </g>

          {/* Gardu distribusi */}
          <g transform="translate(-115 0)" className={zone("gd")} onClick={() => onSelect("gd")} color="var(--color-mv)">
            <RouteRail d="M840 93V127" width={1.9} />
            <CircuitBreaker x={840} y={136} label="QF-31" state="CLOSED" />
            <RouteRail d="M840 145V159" width={1.9} />
            {energised && <FlowArrow x={840} y={155} direction="down" />}
            <circle cx="840" cy="176" r="17" fill="var(--color-surface)" stroke="currentColor" strokeWidth="2" />
            <circle cx="840" cy="198" r="17" fill="var(--color-surface)" stroke="var(--color-lv)" strokeWidth="2" />
            {energised && <circle cx="840" cy="187" r="10" fill="var(--color-primary)" opacity="0.18" className="pulse-node" />}
            <text x="870" y="176" fill="var(--color-foreground)" fontSize="11.5" fontFamily="var(--font-display)">
              TR GD-01
            </text>
            <text x="870" y="191" fill="var(--color-muted-foreground)" fontSize="9.3" fontFamily="var(--font-mono)">
              400 kVA · 20/0.4 kV
            </text>
            <text x="870" y="205" fill={gdLossKwh == null ? "var(--color-muted-foreground)" : HOT} fontSize="8.8" fontFamily="var(--font-mono)">
              {gdLossKwh == null ? "susut —" : `susut ${gdLossKwh.toFixed(2)} kWh/hari`}
            </text>

            <g color="var(--color-lv)">
              <RouteRail d="M840 215V243" width={1.9} />
              <CircuitBreaker x={840} y={252} label="QF-LV" state="CLOSED" />
              <RouteRail d="M840 261V282" width={1.9} />
              <RouteRail d="M730 282H970" width={2.5} />
              {energised && (
                <g filter="url(#flowGlow)">
                  <FlowPath d="M840 215V243" fast={fastFlow} width={1.15} />
                  <FlowPath d="M840 261V282" fast={fastFlow} width={1.15} />
                  <FlowPath d="M840 282H755" fast={fastFlow} width={1.25} />
                  <FlowPath d="M840 282H945" fast={fastFlow} width={1.25} />
                  <FlowArrow x={840} y={272} direction="down" />
                  <FlowArrow x={785} y={282} direction="left" />
                  <FlowArrow x={905} y={282} direction="right" />
                </g>
              )}
            </g>
            <text x="700" y="270" fill="var(--color-lv)" fontSize="9.5" fontFamily="var(--font-mono)">
              BUSBAR 0.4 kV · 3Φ4W
            </text>

            {[
              { x: 755, name: "JTR-01", cust: 34, qf: "QF-41" },
              { x: 850, name: "JTR-02", cust: 30, qf: "QF-42" },
              { x: 945, name: "JTR-03", cust: 26, qf: "QF-43" },
            ].map((b) => (
              <g key={b.name} color="var(--color-lv)">
                <RouteRail d={`M${b.x} 282V305`} width={1.75} />
                <CircuitBreaker x={b.x} y={314} label={b.qf} state="CLOSED" />
                <RouteRail d={`M${b.x} 323V350`} width={1.75} />
                {energised && (
                  <g filter="url(#flowGlow)">
                    <FlowPath d={`M${b.x} 282V305`} fast={false} width={1.1} />
                    <FlowPath d={`M${b.x} 323V350`} fast={false} width={1.1} />
                    <FlowArrow x={b.x} y={339} direction="down" />
                  </g>
                )}
                <RouteRail d={`M${b.x - 28} 350H${b.x + 28}`} width={1.9} />
                <path d={`M${b.x - 18} 350V371M${b.x} 350V371M${b.x + 18} 350V371`} stroke="currentColor" strokeWidth="1.1" opacity="0.85" />
                <circle cx={b.x - 18} cy="378" r="4.6" fill="var(--color-surface-2)" stroke="currentColor" />
                <circle cx={b.x} cy="378" r="4.6" fill="var(--color-surface-2)" stroke="currentColor" />
                <circle cx={b.x + 18} cy="378" r="4.6" fill="var(--color-surface-2)" stroke="currentColor" />
                <text x={b.x} y="402" textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="9" fontFamily="var(--font-mono)">
                  {b.name} · {b.cust} plg
                </text>
              </g>
            ))}
          </g>
        </g>

        {/* Compact operational legend: voltage color, breaker state, and power-flow direction are distinct concepts. */}
        <g>
          <rect x="24" y="364" width="574" height="48" rx="7" fill="var(--color-surface)" stroke="var(--color-border)" />
          <text x="40" y="382" fill="var(--color-foreground)" fontSize="9.5" fontFamily="var(--font-display)">
            Konvensi
          </text>
          <circle cx="103" cy="378" r="3.4" fill="var(--color-mv)" />
          <text x="113" y="382" fill="var(--color-muted-foreground)" fontSize="8.8">20 kV / TM</text>
          <circle cx="188" cy="378" r="3.4" fill="var(--color-lv)" />
          <text x="198" y="382" fill="var(--color-muted-foreground)" fontSize="8.8">0.4 kV / TR-JTR</text>
          <text x="313" y="382" fill="var(--color-muted-foreground)" fontSize="8.8">solid = topology · dash = live flow</text>

          <rect x="40" y="393" width="9" height="9" rx="1" fill="var(--color-surface-2)" stroke="var(--color-success)" />
          <path d="M44.5 394.8V400.2" stroke="var(--color-success)" strokeWidth="1.2" strokeLinecap="round" />
          <text x="56" y="401" fill="var(--color-muted-foreground)" fontSize="8.5">CB: CLOSED = tersambung · OPEN = gap</text>
          <path d="M302 397L307 400L302 403" fill="none" stroke="var(--color-primary)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <text x="315" y="401" fill="var(--color-muted-foreground)" fontSize="8.5">› arah aliran daya</text>
        </g>
      </svg>
    </div>
  );
}
