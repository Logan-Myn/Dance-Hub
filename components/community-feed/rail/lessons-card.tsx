import Link from "next/link";
import { communityPath } from "@/lib/safe-redirect";
import { RailSection } from "./rail-section";
import type { FeedLesson } from "../types";

const eur = (n: number) => `€${Number.isInteger(n) ? n : n.toFixed(2)}`;
const where = { online: "online", in_person: "in person", both: "online or in person" } as const;

/** Up to two private lessons, member price first. */
export function LessonsCard({ slug, lessons, teacherName, isMember }: { slug: string; lessons: FeedLesson[]; teacherName: string; isMember: boolean }) {
  const anyDiscount = isMember && lessons.some((l) => l.memberPrice != null && l.memberPrice < l.regularPrice);
  return (
    <RailSection title={`Private lessons with ${teacherName}`}>
      <div className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {lessons.map((l) => {
          const discounted = isMember && l.memberPrice != null && l.memberPrice < l.regularPrice;
          return (
            <Link
              key={l.id}
              href={communityPath(slug, "/private-lessons")}
              className="flex items-center justify-between gap-3 px-3.5 py-[11px] transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0">
                <strong className="block truncate text-[14px] font-semibold text-ink">{l.title}</strong>
                <span className="text-[12.5px] text-ink-3">
                  {l.durationMinutes} min, {where[l.locationType]}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <b className="block text-[14.5px] text-ink">{eur(discounted ? l.memberPrice! : l.regularPrice)}</b>
                {discounted && (
                  <s className="text-[12.5px] text-ink-3" aria-label={`regular price ${eur(l.regularPrice)}`}>
                    {eur(l.regularPrice)}
                  </s>
                )}
              </span>
            </Link>
          );
        })}
      </div>
      {anyDiscount && <p className="text-[12.5px] text-ink-3">Member prices. Regular price crossed out.</p>}
    </RailSection>
  );
}
