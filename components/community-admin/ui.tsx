import { cn } from "@/lib/utils";

/** Title row of an admin screen: heading, a line under it, actions on the right. */
export function ScreenHead({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-balance font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[30px]">{title}</h1>
        {sub && <p className="mt-1.5 text-[15px] text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A white card. `as="section"` with a heading id for landmarks. */
export function Card({
  children,
  className,
  as: Tag = "div",
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "div" | "section" }) {
  return (
    <Tag className={cn("rounded-2xl border border-line bg-surface", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Card heading row: title, a muted note or control on the right. */
export function CardHead({ id, title, aside, sub }: { id?: string; title: string; aside?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-4">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-[17px] font-semibold text-ink">
          {title}
        </h2>
        {sub && <p className="mt-0.5 text-[13.5px] text-ink-2">{sub}</p>}
      </div>
      {aside && <div className="text-[13.5px] text-ink-3">{aside}</div>}
    </div>
  );
}

/** Screen body: head, then cards with even spacing. */
export function Screen({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 flex-col gap-5", className)}>{children}</div>;
}
