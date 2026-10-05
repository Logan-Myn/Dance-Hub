import Link from "next/link";
import { communityPath } from "@/lib/safe-redirect";

/**
 * Shown to owners and site admins on a page whose offering is switched off.
 * `contained={false}` when the page already wraps it in its own container.
 */
export function OfferingOffBanner({ slug, contained = true }: { slug: string; contained?: boolean }) {
  const box = (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm"
    >
      <span className="font-semibold text-ink">Off for members.</span>
      <span className="text-ink-2">Members can&apos;t open this page. You see it because you manage the community.</span>
      <Link href={communityPath(slug, "/admin/offerings")} className="font-semibold text-brand-ink underline-offset-[3px] hover:underline">
        Turn it on in Admin, Offerings
      </Link>
    </div>
  );
  if (!contained) return <div className="mb-6">{box}</div>;
  return <div className="mx-auto mt-4 max-w-[1160px] px-4 sm:px-6">{box}</div>;
}
