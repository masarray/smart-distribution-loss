import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage, type AppLanguage } from "@/lib/sdl/i18n";

function findHeaderTarget() {
  const fieldActions = document.querySelector<HTMLElement>('[data-field-cockpit="true"] header > .ml-auto');
  if (fieldActions) return fieldActions;
  return document.querySelector<HTMLElement>("header > .ml-auto") ?? document.querySelector<HTMLElement>("header");
}

function FlagIcon({ language }: { language: AppLanguage }) {
  if (language === "id") {
    return (
      <svg
        viewBox="0 0 24 16"
        className="h-3.5 w-[21px] shrink-0 overflow-hidden rounded-[2px] ring-1 ring-white/20"
        aria-hidden="true"
        data-flag-code="ID"
      >
        <rect width="24" height="8" fill="#CE1126" />
        <rect y="8" width="24" height="8" fill="#FFFFFF" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 16"
      className="h-3.5 w-[21px] shrink-0 overflow-hidden rounded-[2px] ring-1 ring-white/20"
      aria-hidden="true"
      data-flag-code="GB"
    >
      <rect width="24" height="16" fill="#012169" />
      <path d="M0 0L24 16M24 0L0 16" stroke="#FFFFFF" strokeWidth="4" />
      <path d="M0 0L24 16M24 0L0 16" stroke="#C8102E" strokeWidth="1.7" />
      <path d="M12 0V16M0 8H24" stroke="#FFFFFF" strokeWidth="5" />
      <path d="M12 0V16M0 8H24" stroke="#C8102E" strokeWidth="2.6" />
    </svg>
  );
}

export function LanguageControl() {
  const { language, toggleLanguage } = useLanguage();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const refresh = () => setTarget(findHeaderTarget());
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const switchLabel = language === "id" ? "Ganti ke English" : "Switch to Indonesian";

  const control = (
    <div
      className="shrink-0"
      data-i18n-skip="true"
      data-language-control="true"
      data-language={language}
    >
      <button
        type="button"
        onClick={toggleLanguage}
        aria-label={switchLabel}
        title={switchLabel}
        className="inline-flex h-8 min-w-[68px] items-center justify-center gap-1.5 rounded-md border border-border/70 bg-surface-2 px-2.5 text-[10px] font-semibold text-foreground shadow-sm transition-colors hover:border-primary/35 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        data-language={language}
      >
        <FlagIcon language={language} />
        <span className="numeric tracking-wide">{language.toUpperCase()}</span>
      </button>
    </div>
  );

  if (target) return createPortal(control, target);

  return (
    <div className="fixed right-3 top-3 z-[90]" data-i18n-skip="true">
      {control}
    </div>
  );
}
