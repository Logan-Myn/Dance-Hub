import { ExternalLink, Instagram, Link2 } from "lucide-react";
import { RailSection } from "./rail-section";

export function LinksCard({ links }: { links: Array<{ title: string; url: string }> }) {
  return (
    <RailSection title="Links">
      <div className="flex flex-col gap-0.5">
        {links.map((l, i) => {
          const Icon = /instagram\.com/i.test(l.url) ? Instagram : Link2;
          return (
            <a
              key={`${l.url}-${i}`}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="-mx-2.5 flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[14px] font-medium text-ink-2 transition-colors hover:bg-surface hover:text-ink"
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{l.title}</span>
              <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
            </a>
          );
        })}
      </div>
    </RailSection>
  );
}
