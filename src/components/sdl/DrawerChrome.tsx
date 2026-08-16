import type { HTMLAttributes, ReactNode } from "react";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const DRAWER_SHEET_CLASS =
  "flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden border-border bg-surface p-0";

export const DRAWER_HEADER_CLASS =
  "shrink-0 border-b border-border/65 px-4 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5";

export const DRAWER_BODY_CLASS =
  "flex min-h-0 flex-1 flex-col px-4 pb-3 pt-3 sm:px-5 sm:pb-4 sm:pt-4";

export const DRAWER_TABS_LIST_CLASS =
  "grid h-9 min-h-9 shrink-0 bg-surface-2/85 p-1";

export const DRAWER_TAB_CLASS =
  "min-w-0 px-1.5 text-[11px] sm:px-2 sm:text-xs data-[state=active]:bg-surface data-[state=active]:text-primary data-[state=active]:shadow-none";

export const DRAWER_TAB_CONTENT_CLASS =
  "mt-3 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col";

export const DRAWER_SCROLL_CLASS = "min-h-0 flex-1 pr-3";

export const DRAWER_SECTION_CLASS =
  "rounded-lg border border-border/55 bg-surface-2/35 p-3.5";

export function DrawerHeader({
  icon,
  title,
  description,
  iconClassName,
}: {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  iconClassName?: string;
}) {
  return (
    <SheetHeader className={DRAWER_HEADER_CLASS} data-drawer-header="true">
      <div className="flex min-w-0 items-center gap-2.5 pr-9">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-primary",
            iconClassName,
          )}
          data-drawer-icon="true"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <SheetTitle className="truncate font-display text-base font-semibold sm:text-lg" data-drawer-title="true">
            {title}
          </SheetTitle>
          <SheetDescription className="mt-0.5 truncate text-xs sm:text-sm" data-drawer-description="true">
            {description}
          </SheetDescription>
        </div>
      </div>
    </SheetHeader>
  );
}

export function DrawerRow({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,62%)] items-start gap-4 border-b border-border/45 py-2 text-[13px] last:border-0 sm:text-sm"
      data-drawer-row="true"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 break-words text-right text-foreground", mono && "numeric")}>{value}</span>
    </div>
  );
}

export function DrawerSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn(DRAWER_SECTION_CLASS, className)} {...props} />;
}
