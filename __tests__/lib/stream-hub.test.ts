/**
 * @jest-environment node
 */
import { generateToken, setParticipantCanPublish } from '@/lib/stream-hub';

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }), text: async () => '' });
  global.fetch = mockFetch as unknown as typeof fetch;
});

const lastCall = () => {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return { url: url as string, init: init as RequestInit, body: JSON.parse((init as RequestInit).body as string) };
};

it('sends the display name next to the identity when asking for a token', async () => {
  await generateToken('live-class-lc1', 'u1', 'viewer', 'Anna');
  const { url, body } = lastCall();
  expect(url).toMatch(/\/rooms\/live-class-lc1\/tokens$/);
  expect(body).toEqual({ identity: 'u1', role: 'viewer', name: 'Anna' });
});

it('sets all three permission flags so subscribe and data stay on', async () => {
  // The media server replaces the whole permission object: a missing flag
  // means false, which would cut the student off from the class.
  await setParticipantCanPublish('live-class-lc1', 'user/1', true);
  const { url, init, body } = lastCall();
  expect(init.method).toBe('PATCH');
  expect(url).toMatch(/\/rooms\/live-class-lc1\/participants\/user%2F1$/);
  expect(body).toEqual({ canPublish: true, canSubscribe: true, canPublishData: true });

  await setParticipantCanPublish('live-class-lc1', 'u1', false);
  expect(lastCall().body).toEqual({ canPublish: false, canSubscribe: true, canPublishData: true });
});
