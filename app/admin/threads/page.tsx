import { getAllAdminThreads } from '@/lib/admin-platform/threads';
import { ThreadsTable } from '@/components/admin/platform/ThreadsTable';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function ThreadsPage() {
  const threads = await getAllAdminThreads();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500 space-y-8">
      <header>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Threads
        </h1>
        <p className="text-muted-foreground mt-2">
          {threads.length.toLocaleString()}{' '}
          {threads.length === 1 ? 'thread' : 'threads'} across all communities.
        </p>
      </header>

      <ThreadsTable threads={threads} />
    </div>
  );
}
