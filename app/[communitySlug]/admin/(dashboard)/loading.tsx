export default function AdminLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <header>
        <div className="h-12 w-56 sm:w-72 bg-muted rounded-xl" />
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-card rounded-2xl p-6 border border-border/40 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 bg-muted rounded" />
              <div className="h-10 w-10 bg-muted rounded-xl" />
            </div>
            <div className="h-9 w-24 bg-muted rounded" />
            <div className="h-3 w-32 bg-muted rounded" />
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl p-6 border border-border/40 h-72" />

      <div className="bg-card rounded-2xl p-6 border border-border/40 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-10 w-10 bg-muted rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 bg-muted rounded" />
              <div className="h-3 w-1/3 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
