// Replies for a post, fetched ahead of time (when the pointer reaches the
// post, or a finger touches it) and kept for a while, so the thread opens
// with its replies already there instead of flashing "No replies yet".

type Comments = unknown[];

const FRESH_MS = 60_000;
const store = new Map<string, { at: number; comments?: Comments; pending?: Promise<Comments | null> }>();

function fetchComments(threadId: string): Promise<Comments | null> {
  const entry = store.get(threadId);
  if (entry?.pending) return entry.pending;
  const pending = fetch(`/api/threads/${threadId}/comments`)
    .then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) ? data : null;
    })
    .catch(() => null)
    .then((comments) => {
      const current = store.get(threadId);
      if (comments) store.set(threadId, { at: Date.now(), comments });
      else if (current) store.set(threadId, { at: current.at, comments: current.comments });
      else store.delete(threadId);
      return comments;
    });
  store.set(threadId, { at: entry?.at ?? 0, comments: entry?.comments, pending });
  return pending;
}

/** Start loading a post's replies unless they're already here and fresh. */
export function prefetchComments(threadId: string): void {
  const entry = store.get(threadId);
  if (entry?.pending) return;
  if (entry?.comments && Date.now() - entry.at < FRESH_MS) return;
  void fetchComments(threadId);
}

/** Replies already loaded for this post, if any (possibly a little old). */
export function peekComments(threadId: string): Comments | undefined {
  return store.get(threadId)?.comments;
}

/** Load the replies, sharing a request that's already on its way. */
export function loadComments(threadId: string): Promise<Comments | null> {
  return fetchComments(threadId);
}

/** Keep the cache in step after the viewer adds, edits or removes a reply. */
export function rememberComments(threadId: string, comments: Comments): void {
  store.set(threadId, { at: Date.now(), comments });
}
