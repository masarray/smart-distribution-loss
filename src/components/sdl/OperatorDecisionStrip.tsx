import { AlertTriangle, CheckCircle2, CircleDotDashed, ShieldAlert } from "lucide-react";
import type { OperatorDecision } from "@/lib/sdl/operation";
import { cn } from "@/lib/utils";

export function OperatorDecisionStrip({ decision }: { decision: OperatorDecision }) {
  const tone = decision.status;
  const icon =
    tone === "NORMAL" ? (
      <CheckCircle2 className="size-3.5" />
    ) : tone === "ATTENTION" ? (
      <AlertTriangle className="size-3.5" />
    ) : tone === "REVIEW" ? (
      <ShieldAlert className="size-3.5" />
    ) : (
      <CircleDotDashed className="size-3.5" />
    );

  return (
    <div
      className={cn(
        "mt-2 rounded-md border px-2.5 py-2",
        tone === "NORMAL"
          ? "border-success/25 bg-success/5"
          : tone === "ATTENTION"
            ? "border-warn/30 bg-warn/5"
            : tone === "REVIEW"
              ? "border-destructive/30 bg-destructive/5"
              : "border-border/55 bg-surface-2/45",
      )}
      data-operator-decision="true"
      data-decision-status={decision.status}
      data-decision-source={decision.source}
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
            tone === "NORMAL"
              ? "bg-success/10 text-success"
              : tone === "ATTENTION"
                ? "bg-warn/10 text-warn"
                : tone === "REVIEW"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-surface text-muted-foreground",
          )}
        >
          {icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "shrink-0 text-[9px] font-semibold tracking-[0.08em]",
                tone === "NORMAL"
                  ? "text-success"
                  : tone === "ATTENTION"
                    ? "text-warn"
                    : tone === "REVIEW"
                      ? "text-destructive"
                      : "text-muted-foreground",
              )}
              data-decision-label="true"
            >
              {decisionStatusLabel(decision.status)}
            </span>
            <p className="truncate text-[11px] font-semibold text-foreground" data-decision-headline="true">
              {decision.headline}
            </p>
          </div>

          <p className="mt-0.5 text-[10.5px] leading-[1.35] text-muted-foreground" data-decision-reason="true">
            {decision.reason}
          </p>

          {decision.evidence && (
            <p className="mt-0.5 truncate text-[9.5px] text-muted-foreground/80" data-decision-evidence="true">
              Dasar: {decision.evidence}
            </p>
          )}

          <div className="mt-1 flex items-start gap-1.5 border-t border-border/35 pt-1">
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Tindakan</span>
            <p className="text-[10.5px] leading-[1.35] text-foreground" data-decision-action="true">
              {decision.action}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function decisionStatusLabel(status: OperatorDecision["status"]) {
  if (status === "NORMAL") return "NORMAL";
  if (status === "ATTENTION") return "PERHATIAN";
  if (status === "REVIEW") return "TINJAU";
  return "SIAP";
}
