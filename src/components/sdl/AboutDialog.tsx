import { useState } from "react";
import { ExternalLink, Info, Linkedin, X } from "lucide-react";

const LINKEDIN_URL = "https://www.linkedin.com/in/ari-sulistiono";

export function AboutDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-3 right-3 z-[80] inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-surface/95 px-2.5 text-[10px] font-semibold text-muted-foreground shadow-lg backdrop-blur transition-colors hover:border-primary/35 hover:bg-surface-2 hover:text-foreground"
        aria-label="Tentang aplikasi"
        data-about-launcher="true"
      >
        <Info className="size-3.5" /> About
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-title"
          data-about-dialog="true"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-border/70 bg-surface p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Info className="size-4.5" />
                </span>
                <div>
                  <p className="label-xs">About</p>
                  <h2 id="about-title" className="font-display text-base font-semibold">Smart Distribution Loss</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup About"
                className="flex size-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                data-about-close="true"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Engineering tool untuk analisis susut distribusi yang traceable, berbasis physics, dan dapat diaudit dari data lapangan sampai hasil koreksi.
            </p>

            <div className="mt-4 rounded-lg border border-border/55 bg-surface-2/55 p-3" data-about-developer="true">
              <p className="label-xs">Developer</p>
              <p className="mt-1 font-display text-sm font-semibold text-foreground">Ari Sulistiono</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Power systems · substation automation · engineering software</p>
              <a
                href={LINKEDIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/8 px-2.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/12"
                data-about-linkedin="true"
              >
                <Linkedin className="size-3.5" /> LinkedIn <ExternalLink className="size-3" />
              </a>
            </div>

            <p className="mt-3 text-[8.5px] leading-relaxed text-muted-foreground/75">
              Field Mode menjaga provenance data, hasil solver, evidence pengukuran, koreksi terverifikasi, audit package, dan reproducible replay secara terpisah dari demo synthetic.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
