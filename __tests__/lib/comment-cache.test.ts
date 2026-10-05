import { loadComments, peekComments, prefetchComments, rememberComments } from '@/lib/feed/comment-cache';

const reply = (id: string) => ({ id, content: 'Hi' });

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => [reply('c1')] })) as unknown as typeof fetch;
});

describe('comment cache', () => {
  it('shares one request between the hover prefetch and the open', async () => {
    prefetchComments('t1');
    prefetchComments('t1');
    const comments = await loadComments('t1');
    expect(comments).toEqual([reply('c1')]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(peekComments('t1')).toEqual([reply('c1')]);
  });

  it("doesn't fetch again while the replies are fresh", async () => {
    await loadComments('t2');
    prefetchComments('t2');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps what the viewer just changed', () => {
    rememberComments('t3', [reply('c9')]);
    expect(peekComments('t3')).toEqual([reply('c9')]);
  });

  it('keeps nothing when the request fails', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await loadComments('t4')).toBeNull();
    expect(peekComments('t4')).toBeUndefined();
  });
});
