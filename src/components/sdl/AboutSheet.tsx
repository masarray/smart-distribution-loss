import { CircuitBoard, ExternalLink, Info, Linkedin } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const LINKEDIN_URL = "https://id.linkedin.com/in/ari-sulistiono";

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
              Aplikasi engineering untuk analisis, investigasi, koreksi, dan audit susut distribusi berbasis perhitungan lokal di browser.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5" data-about-author="Ari Sulistiono">
            <p className="label-xs">Creator & engineer</p>
            <p className="mt-1 font-display text-base font-semibold text-foreground">Ari Sulistiono</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Smart Distribution Loss dikembangkan sebagai software engineering yang menekankan traceability, reproducibility, dan keputusan berbasis evidence.
            </p>
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-[#0A66C2]/35 bg-[#0A66C2]/10 px-2.5 text-[10px] font-semibold text-foreground transition-colors hover:bg-[#0A66C2]/15"
              data-about-linkedin="true"
            >
              <Linkedin className="size-3.5" /> LinkedIn Ari Sulistiono <ExternalLink className="size-3" />
            </a>
          </div>

          <div className="rounded-lg border border-border/50 bg-surface-2/45 p-3 text-[9.5px] leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Engineering principle</p>
            <p className="mt-1">Tidak membuat topology, measurement, koreksi, atau hasil physics palsu. Setiap perubahan harus bisa ditelusuri kembali ke data dan evidence yang digunakan.</p>
          </div>

          <p className="text-[8.5px] leading-relaxed text-muted-foreground/80">Smart Distribution Loss · browser-local engineering workflow · P12 audit replay.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
