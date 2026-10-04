import Link from "next/link";
import { Check, Lock, Play } from "lucide-react";
import { hueForId } from "@/components/ds/initials-avatar";
import type { ReplayItem } from "@/lib/classroom/data";
import { communityPath } from "@/lib/safe-redirect";

const day = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone });

/** Live class recordings as a sideways row of video cards. */
export function ReplaysRow({
  slug,
  courseSlug,
  items,
  isPublic,
  canManage,
  timeZone,
}: {
  slug: string;
  courseSlug: string;
  items: ReplayItem[];
  isPublic: boolean;
  canManage: boolean;
  timeZone: string;
}) {
  const base = communityPath(slug, `/classroom/${encodeURIComponent(courseSlug)}`);
  return (
    <section aria-labelledby="replays-title" className="mt-8 flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="replays-title" className="font-display text-[19px] font-semibold text-ink">
          Live class replays
        </h2>
        <Link href={base} className="text-[14px] font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]">
          See all {items.length}
        </Link>
      </div>
      {canManage && !isPublic && (
        <p className="flex items-center gap-2 text-[13.5px] text-ink-2">
          <Lock className="h-4 w-4" aria-hidden="true" />
          Only you can see replays for now. Publish the replays course in its settings to share them with members.
        </p>
      )}
      <div className="scrollbar-hide -m-0.5 grid snap-x snap-mandatory auto-cols-[78%] grid-flow-col gap-4 overflow-x-auto p-0.5 pb-2 sm:auto-cols-[minmax(240px,1fr)]">
        {items.map((r) => (
          <Link key={r.lessonId} href={`${base}?lesson=${r.lessonId}`} className="group flex snap-start flex-col gap-2 rounded-[14px] text-left">
            <span
              className="relative aspect-video overflow-hidden rounded-xl transition-shadow duration-200 group-hover:shadow-raised"
              style={{
                background: `radial-gradient(60% 80% at 30% 40%, hsl(${hueForId(r.lessonId)} 70% 62% / .9), transparent 70%), hsl(${hueForId(r.lessonId)} 35% 22%)`,
              }}
            >
              {r.playbackId && (
                <img
                  src={`https://image.mux.com/${r.playbackId}/thumbnail.webp?width=480&fit_mode=smartcrop`}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-[5px] text-[11.5px] font-bold leading-none text-white">
                {r.watched ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Watched
                  </>
                ) : (
                  "Not watched"
                )}
              </span>
              <span className="absolute inset-0 grid place-items-center text-white">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-black/40 transition-[transform,background-color] duration-200 group-hover:scale-110 group-hover:bg-black/60">
                  <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden="true" />
                </span>
              </span>
              {r.durationMinutes && (
                <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-1 text-[12px] font-semibold leading-none tabular-nums text-white">
                  {r.durationMinutes} min
                </span>
              )}
            </span>
            <strong className="font-display text-[15px] font-semibold leading-[1.3] text-ink group-hover:text-brand-ink">{r.title}</strong>
            <span className="-mt-1 text-[13px] text-ink-3">{day(r.date, timeZone)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
