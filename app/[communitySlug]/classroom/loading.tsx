/** Classroom placeholder while the courses load. */
export default function ClassroomLoading() {
  const sk = "block animate-pulse rounded-md bg-surface-3 motion-reduce:animate-none";
  return (
    <div className="mx-auto max-w-[1160px] px-4 pb-12 pt-4 sm:px-6 sm:pt-7" aria-busy="true">
      <span className="sr-only">Loading the classroom</span>
      <span className={`${sk} h-8 w-48`} />
      <span className={`${sk} mt-3 h-4 w-72`} />
      <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-5" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-line bg-surface">
            <span className={`${sk} aspect-[3/2] rounded-none`} />
            <div className="flex flex-col gap-2.5 p-4">
              <span className={`${sk} h-5 w-3/5`} />
              <span className={`${sk} h-3 w-11/12`} />
              <span className={`${sk} h-3 w-2/5`} />
              <span className={`${sk} mt-3 h-1.5 w-full`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
