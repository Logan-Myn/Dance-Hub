import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  children,
  actions,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-9 text-center",
        className
      )}
    >
      {icon && (
        <div aria-hidden="true" className="mb-1 grid h-16 w-16 place-items-center rounded-[18px] bg-brand-soft text-brand-ink">
          {icon}
        </div>
      )}
      <h3 className="font-display text-[19px] font-semibold text-ink [text-wrap:balance]">{title}</h3>
      {children && <div className="max-w-[44ch] text-[15px] text-ink-2">{children}</div>}
      {actions && <div className="mt-1.5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
