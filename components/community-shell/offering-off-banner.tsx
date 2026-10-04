/**
 * Shown to owners and site admins on a page whose offering is switched off.
 * `contained={false}` when the page already wraps it in its own container.
 */
export function OfferingOffBanner({ contained = true }: { contained?: boolean }) {
  const box = (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm"
    >
      <span className="font-semibold text-ink">Off for members.</span>
      <span className="text-ink-2">Members can&apos;t open this page. You see it because you manage the community.</span>
    </div>
  );
  if (!contained) return <div className="mb-6">{box}</div>;
  return <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6 lg:px-8">{box}</div>;
}
