/**
 * The broadcast archive page shows owner-written email HTML. Platform admins
 * open it too, so it must not run in our origin: the HTML is sanitized and
 * shown in a sandboxed iframe with no scripts and an opaque origin.
 */
import { render } from '@testing-library/react';
import BroadcastDetailPage from '@/app/[communitySlug]/admin/(with-nav)/emails/[broadcastId]/page';
import { queryOne } from '@/lib/db';

jest.mock('@/lib/community-auth', () => ({
  requireCommunityManagerPage: jest.fn().mockResolvedValue({}),
}));
jest.mock('@/lib/community-data', () => ({
  getCommunityBySlug: jest.fn().mockResolvedValue({ id: 'c1', slug: 'salsa' }),
}));
jest.mock('@/lib/db', () => ({ queryOne: jest.fn() }));

const broadcast = {
  id: 'b1',
  subject: 'Spring news',
  html_content:
    '<p>Hello <a href="https://dance-hub.io/salsa">there</a></p><img src="x" onerror="window.__xss = 1"><script>window.__xss = 2</script>',
  preview_text: null,
  recipient_count: 3,
  status: 'sent',
  error_message: null,
  sent_at: '2026-09-01T10:00:00Z',
  created_at: '2026-09-01T09:00:00Z',
};

async function renderPage() {
  (queryOne as jest.Mock).mockResolvedValueOnce(broadcast);
  const ui = await BroadcastDetailPage({
    params: Promise.resolve({ communitySlug: 'salsa', broadcastId: 'b1' }),
  });
  return render(ui);
}

describe('broadcast archive page', () => {
  it('renders the email in a sandboxed iframe without scripts or same-origin', async () => {
    const { container } = await renderPage();
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const sandbox = iframe!.getAttribute('sandbox');
    expect(sandbox).not.toBeNull();
    expect(sandbox).not.toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
  });

  it('puts only sanitized HTML in the frame, behind a no-script CSP', async () => {
    const { container } = await renderPage();
    const doc = container.querySelector('iframe')!.getAttribute('srcdoc')!;
    expect(doc).toContain('Hello <a href="https://dance-hub.io/salsa"');
    expect(doc).not.toContain('onerror');
    expect(doc).not.toContain('<script');
    expect(doc).toContain('Content-Security-Policy');
    expect(doc).toContain("default-src 'none'");
  });

  it('does not inject the email HTML into the page itself', async () => {
    const { container } = await renderPage();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });
});
