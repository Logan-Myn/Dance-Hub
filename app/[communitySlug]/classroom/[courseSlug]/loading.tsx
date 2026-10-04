/** Course page placeholder while the lessons load. */
export default function CourseLoading() {
  const sk = "block animate-pulse rounded-md bg-surface-3 motion-reduce:animate-none";
  return (
    <div className="mx-auto max-w-[1160px] px-4 pb-12 pt-4 sm:px-6 sm:pt-7" aria-busy="true">
      <span className="sr-only">Loading the course</span>
      <span className={`${sk} h-4 w-40`} />
      <span className={`${sk} mt-4 h-8 w-72`} />
      <div className="mt-6 grid grid-cols-1 gap-7 lg:grid-cols-[320px_minmax(0,1fr)]" aria-hidden="true">
        <div className="hidden flex-col gap-3 rounded-2xl border border-line bg-surface p-4 lg:flex">
          <span className={`${sk} h-4 w-1/2`} />
          <span className={`${sk} h-1.5 w-full`} />
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={`${sk} h-9 w-full`} />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <span className={`${sk} aspect-video w-full rounded-2xl`} />
          <span className={`${sk} h-7 w-2/3`} />
          <span className={`${sk} h-4 w-1/2`} />
        </div>
      </div>
    </div>
  );
}
