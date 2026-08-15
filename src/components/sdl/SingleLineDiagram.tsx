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
  return (
    <g aria-label={label}>
      <rect
        x={x - 12}
        y={y - 9}
        width="24"
        height="18"
        rx="1.5"
        fill="var(--color-surface)"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d={`M${x - 7} ${y - 5}L${x + 7} ${y + 5}M${x + 7} ${y - 5}L${x - 7} ${y + 5}`}
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <text
        x={x}
        y={y - 15}
        textAnchor="middle"
        fill="var(--color-muted-foreground)"
        fontSize="8.5"
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
      <circle
        cx={x}
        cy={y}
        r="11"
        fill="var(--color-surface)"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <text
        x={x}
        y={y + 3}
        textAnchor="middle"
        fill="currentColor"
        fontSize="8"
        fontFamily="var(--font-mono)"
      >
        M
      </text>
      <text
        x={x + 17}
        y={y + 3}
        fill="var(--color-muted-foreground)"
        fontSize="8.5"
        fontFamily="var(--font-mono)"
      >
        {label}
      </text>
    </g>
  );
}

function LoadSymbol({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x - 11} ${y - 10}H${x + 11}L${x} ${y + 10}Z`}
      fill="var(--color-surface)"
      stroke="currentColor"
      strokeWidth="1.8"
    />
  );
}

function RouteRail({ d, width = 4.6 }: { d: string; width?: number }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.16"
      pointerEvents="none"
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
  const flowClass = energised ? (intensity > 0.6 ? "flow-dash" : "flow-dash-slow") : "";

  const zone = (id: AssetId) =>
    cn(
      "cursor-pointer transition-opacity duration-150",
      selected === id || selected === "feeder"
        ? "opacity-100"
        : "opacity-90 hover:opacity-100",
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
          <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Upstream source boundary and incoming protection */}
        <g color="var(--color-mv)">
          <rect
            x="24"
            y="58"
            width="144"
            height="70"
            rx="7"
            fill="var(--color-surface-2)"
            stroke="var(--color-border)"
          />
          <circle cx="55" cy="93" r="14" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M47 93c4-8 8 8 12 0s8-8 12 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <text
            x="80"
            y="87"
            fill="var(--color-foreground)"
            fontSize="12.5"
            fontFamily="var(--font-display)"
          >
            GI 150/20 kV
          </text>
          <text x="80" y="104" fill="var(--color-muted-foreground)" fontSize="9.5">
            Grid / upstream source
          </text>

          <RouteRail d="M168 93H260" />
          <path d="M168 93H202" stroke="currentColor" strokeWidth="2.5" />
          <CircuitBreaker x={216} y={93} label="QF-01 / PMT" />
          <path d="M228 93H260" stroke="currentColor" strokeWidth="2.5" />
        </g>

        {/* Main 20 kV busbar / feeder backbone */}
        <g
          className={zone("feeder")}
          onClick={() => onSelect("feeder")}
          color="var(--color-mv)"
        >
          <path
            d="M260 93H955"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            filter="url(#glow)"
          />
          <text
            x="266"
            y="76"
            fill="currentColor"
            fontSize="10.5"
            fontFamily="var(--font-mono)"
          >
            BUS 20 kV · PENYULANG GD-01 · 3Φ
          </text>
          {energised && (
            <path
              d="M260 93H955"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              className={flowClass}
            />
          )}
        </g>

        {/* Spot MV load branch */}
        <g
          className={zone("spot")}
          onClick={() => onSelect("spot")}
          color="var(--color-mv)"
        >
          <RouteRail d="M390 93V252" />
          <path d="M390 93V134" stroke="currentColor" strokeWidth="2.2" />
          <CircuitBreaker x={390} y={145} label="QF-11" />
          <path d="M390 154V181" stroke="currentColor" strokeWidth="2.2" />
          <MeterSymbol x={390} y={194} label="AMI" />
          <path d="M390 205V228" stroke="currentColor" strokeWidth="2.2" />
          <LoadSymbol x={390} y={242} />
          {energised && (
            <path
              d="M390 93V228"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              className={flowClass}
            />
          )}
          <rect
            x="302"
            y="266"
            width="176"
            height="40"
            rx="6"
            fill="var(--color-surface-2)"
            stroke={selected === "spot" ? "var(--color-primary)" : "var(--color-border)"}
          />
          <text
            x="314"
            y="282"
            fill="var(--color-foreground)"
            fontSize="11"
            fontFamily="var(--font-display)"
          >
            Spot load TM
          </text>
          <text
            x="314"
            y="296"
            fill="var(--color-muted-foreground)"
            fontSize="9"
            fontFamily="var(--font-mono)"
          >
            OBS 100% · {mvLossKwh == null ? "susut —" : `susut ${mvLossKwh.toFixed(2)} kWh/hari`}
          </text>
        </g>

        {/* MV customer branch */}
        <g
          className={zone("tm")}
          onClick={() => onSelect("tm")}
          color="var(--color-mv)"
        >
          <RouteRail d="M600 93V252" />
          <path d="M600 93V134" stroke="currentColor" strokeWidth="2.2" />
          <CircuitBreaker x={600} y={145} label="QF-21" />
          <path d="M600 154V181" stroke="currentColor" strokeWidth="2.2" />
          <MeterSymbol x={600} y={194} label="kWh" />
          <path d="M600 205V228" stroke="currentColor" strokeWidth="2.2" />
          <LoadSymbol x={600} y={242} />
          {energised && (
            <path
              d="M600 93V228"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              className={flowClass}
            />
          )}
          <rect
            x="512"
            y="266"
            width="176"
            height="40"
            rx="6"
            fill="var(--color-surface-2)"
            stroke={selected === "tm" ? "var(--color-primary)" : "var(--color-border)"}
          />
          <text
            x="524"
            y="282"
            fill="var(--color-foreground)"
            fontSize="11"
            fontFamily="var(--font-display)"
          >
            Pelanggan TM
          </text>
          <text
            x="524"
            y="296"
            fill="var(--color-muted-foreground)"
            fontSize="9"
            fontFamily="var(--font-mono)"
          >
            meter interval · 15 menit
          </text>
        </g>

        {/* Distribution transformer branch */}
        <g className={zone("gd")} onClick={() => onSelect("gd")} color="var(--color-mv)">
          <RouteRail d="M840 93V274" width={5.2} />
          <path d="M840 93V124" stroke="currentColor" strokeWidth="2.6" />
          <CircuitBreaker x={840} y={136} label="QF-31" />
          <path d="M840 145V159" stroke="currentColor" strokeWidth="2.6" />
          <circle
            cx="840"
            cy="176"
            r="18"
            fill="var(--color-surface)"
            stroke="currentColor"
            strokeWidth="2.2"
          />
          <circle
            cx="840"
            cy="199"
            r="18"
            fill="var(--color-surface)"
            stroke="var(--color-lv)"
            strokeWidth="2.2"
          />
          {energised && (
            <circle
              cx="840"
              cy="188"
              r="11"
              fill="var(--color-primary)"
              opacity="0.18"
              className="pulse-node"
            />
          )}
          <text
            x="870"
            y="176"
            fill="var(--color-foreground)"
            fontSize="11.5"
            fontFamily="var(--font-display)"
          >
            TR GD-01
          </text>
          <text
            x="870"
            y="191"
            fill="var(--color-muted-foreground)"
            fontSize="9.5"
            fontFamily="var(--font-mono)"
          >
            400 kVA · 20/0.4 kV
          </text>
          <text
            x="870"
            y="205"
            fill={gdLossKwh == null ? "var(--color-muted-foreground)" : HOT}
            fontSize="9"
            fontFamily="var(--font-mono)"
          >
            {gdLossKwh == null ? "susut —" : `susut ${gdLossKwh.toFixed(2)} kWh/hari`}
          </text>

          {/* LV main protection and busbar */}
          <path d="M840 217V234" stroke="var(--color-lv)" strokeWidth="2.6" />
          <g color="var(--color-lv)">
            <CircuitBreaker x={840} y={246} label="QF-LV" />
          </g>
          <path d="M840 255V274" stroke="var(--color-lv)" strokeWidth="2.6" />
          <path
            d="M730 274H970"
            stroke="var(--color-lv)"
            strokeWidth="6"
            strokeLinecap="round"
            filter="url(#glow)"
          />
          <text
            x="730"
            y="260"
            fill="var(--color-lv)"
            fontSize="10"
            fontFamily="var(--font-mono)"
          >
            BUSBAR 0.4 kV · 3Φ4W
          </text>
          {energised && (
            <path
              d="M730 274H970"
              stroke="var(--color-lv)"
              strokeWidth="2.4"
              strokeLinecap="round"
              className={flowClass}
            />
          )}

          {/* Three LV/JTR outgoing feeders */}
          {[
            { x: 755, name: "JTR-01", cust: 34, qf: "QF-41" },
            { x: 850, name: "JTR-02", cust: 30, qf: "QF-42" },
            { x: 945, name: "JTR-03", cust: 26, qf: "QF-43" },
          ].map((b) => (
            <g key={b.name} color="var(--color-lv)">
              <RouteRail d={`M${b.x} 274V350`} width={4.2} />
              <path d={`M${b.x} 274V303`} stroke="currentColor" strokeWidth="2" />
              <CircuitBreaker x={b.x} y={314} label={b.qf} />
              <path d={`M${b.x} 323V350`} stroke="currentColor" strokeWidth="2" />
              {energised && (
                <path
                  d={`M${b.x} 274V350`}
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  className="flow-dash-slow"
                />
              )}
              <path
                d={`M${b.x - 28} 350H${b.x + 28}`}
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <path
                d={`M${b.x - 18} 350V371M${b.x} 350V371M${b.x + 18} 350V371`}
                stroke="currentColor"
                strokeWidth="1.2"
                opacity="0.9"
              />
              <circle
                cx={b.x - 18}
                cy="378"
                r="5"
                fill="var(--color-surface-2)"
                stroke="currentColor"
              />
              <circle
                cx={b.x}
                cy="378"
                r="5"
                fill="var(--color-surface-2)"
                stroke="currentColor"
              />
              <circle
                cx={b.x + 18}
                cy="378"
                r="5"
                fill="var(--color-surface-2)"
                stroke="currentColor"
              />
              <text
                x={b.x}
                y="402"
                textAnchor="middle"
                fill="var(--color-muted-foreground)"
                fontSize="9.5"
                fontFamily="var(--font-mono)"
              >
                {b.name} · {b.cust} plg
              </text>
            </g>
          ))}
        </g>

        {/* Engineering legend */}
        <g>
          <rect
            x="24"
            y="344"
            width="630"
            height="90"
            rx="8"
            fill="var(--color-surface)"
            stroke="var(--color-border)"
          />
          <text
            x="42"
            y="365"
            fill="var(--color-foreground)"
            fontSize="10.5"
            fontFamily="var(--font-display)"
          >
            Konvensi SLD
          </text>
          <circle cx="45" cy="383" r="4" fill="var(--color-mv)" />
          <text x="57" y="387" fill="var(--color-muted-foreground)" fontSize="9.5">
            20 kV / TM
          </text>
          <circle cx="155" cy="383" r="4" fill="var(--color-lv)" />
          <text x="167" y="387" fill="var(--color-muted-foreground)" fontSize="9.5">
            0.4 kV / TR-JTR
          </text>
          <text x="275" y="387" fill="var(--color-muted-foreground)" fontSize="9.5">
            Upstream → busbar → protection → transformer/load → outgoing feeder
          </text>
          <text x="42" y="407" fill="var(--color-muted-foreground)" fontSize="9.5">
            QF = circuit breaker / PMT · M = metering point · dua lingkaran = trafo dua-belitan
          </text>
          <text x="42" y="423" fill="var(--color-muted-foreground)" fontSize="9.5">
            Tampilan engineering IEC-style; detail symbol library final mengikuti standard owner / utility drawing practice.
          </text>
        </g>
      </svg>
    </div>
  );
}
