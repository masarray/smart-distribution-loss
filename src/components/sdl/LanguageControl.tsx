import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/lib/sdl/i18n";

function findHeaderTarget() {
  const fieldActions = document.querySelector<HTMLElement>('[data-field-cockpit="true"] header > .ml-auto');
  if (fieldActions) return fieldActions;
  return document.querySelector<HTMLElement>("header > .ml-auto") ?? document.querySelector<HTMLElement>("header");
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
        aria-label={language === "id" ? "Switch to English" : "Ganti ke Bahasa Indonesia"}
        title={language === "id" ? "Switch to English" : "Ganti ke Bahasa Indonesia"}
        className="inline-flex h-8 min-w-[62px] items-center justify-center gap-1.5 rounded-md border border-border/70 bg-surface-2 px-2.5 text-[10px] font-semibold text-foreground shadow-sm transition-colors hover:border-primary/35 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        data-language={language}
      >
        <span className="text-[15px] leading-none" aria-hidden="true">{language === "id" ? "🇮🇩" : "🇬🇧"}</span>
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
