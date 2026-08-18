import { CircuitBoard, ExternalLink, Github, Info, Linkedin, ShieldCheck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const LINKEDIN_URL = "https://id.linkedin.com/in/ari-sulistiono";
const GITHUB_URL = "https://github.com/masarray/smart-distribution-loss";

export function AboutSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="About Smart Distribution Loss"
          title="About"
          className="fixed bottom-3 right-3 z-[45] inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-surface/95 px-2.5 text-[10px] font-semibold text-muted-foreground shadow-lg backdrop-blur transition-colors hover:border-primary/40 hover:bg-surface-2 hover:text-foreground"
          data-about-trigger="true"
        >
          <Info className="size-3.5" />
          About
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[360px] max-w-[92vw] border-border/70 bg-surface p-0" data-about-panel="true">
        <div className="border-b border-border/60 px-5 py-4">
          <SheetHeader className="space-y-1 pr-8">
            <div className="flex items-center gap-2 text-primary">
              <span className="flex size-8 items-center justify-center rounded-md bg-primary/10">
                <CircuitBoard className="size-4" />
              </span>
              <SheetTitle className="font-display text-base">About Smart Distribution Loss</SheetTitle>
            </div>
            <SheetDescription className="text-[11px] leading-relaxed">
              Public Engineering Beta untuk analisis susut distribusi 3 fasa, rekonsiliasi data lapangan, koreksi terverifikasi, audit replay, dan unexplained energy.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-lg border border-success/25 bg-success/5 p-3" data-about-release="v0.4.0-beta.1">
            <div className="flex items-center gap-1.5 text-success">
              <ShieldCheck className="size-3.5" />
              <p className="label-xs" style={{ color: "inherit" }}>Public Engineering Beta</p>
            </div>
            <p className="mt-1 text-[10px] font-semibold text-foreground">v0.4.0-beta.1 · MIT open source</p>
            <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
              Technical loss berasal dari physics 3 fasa. Unexplained energy adalah sinyal investigasi dan bukan bukti pencurian listrik.
            </p>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5" data-about-author="Ari Sulistiono">
            <p className="label-xs">Creator & engineer</p>
            <p className="mt-1 font-display text-base font-semibold text-foreground">Ari Sulistiono</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Smart Distribution Loss dikembangkan sebagai software engineering yang menekankan traceability, reproducibility, dan keputusan berbasis evidence.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={LINKEDIN_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#0A66C2]/35 bg-[#0A66C2]/10 px-2.5 text-[10px] font-semibold text-foreground transition-colors hover:bg-[#0A66C2]/15"
                data-about-linkedin="true"
              >
                <Linkedin className="size-3.5" /> LinkedIn <ExternalLink className="size-3" />
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-surface-2/60 px-2.5 text-[10px] font-semibold text-foreground transition-colors hover:border-primary/40"
                data-about-github="true"
              >
                <Github className="size-3.5" /> GitHub <ExternalLink className="size-3" />
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-border/50 bg-surface-2/45 p-3 text-[9.5px] leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Engineering principle</p>
            <p className="mt-1">Tidak membuat topology, measurement, koreksi, technical loss, atau customer-level theft conclusion palsu. Setiap perubahan harus dapat ditelusuri kembali ke data dan evidence yang digunakan.</p>
          </div>

          <p className="text-[8.5px] leading-relaxed text-muted-foreground/80">Smart Distribution Loss · browser-local engineering workflow · P13 unexplained-energy separation · P14 public release readiness.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
