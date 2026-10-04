import Link from "next/link";

export function RailSection({ title, link, children }: { title: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[15px] font-semibold text-ink">{title}</h2>
        {link && (
          <Link href={link.href} className="rounded text-[13.5px] font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
