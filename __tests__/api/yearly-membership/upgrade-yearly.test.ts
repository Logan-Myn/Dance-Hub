import { GET, POST } from '@/app/api/community/[communitySlug]/subscription/upgrade-yearly/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ queryOne: (...a: unknown[]) => mockQueryOne(...a), sql: jest.fn() }));
const mockSubRetrieve = jest.fn();
const mockSubUpdate = jest.fn();
const mockInvoicePreview = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: { retrieve: (...a: unknown[]) => mockSubRetrieve(...a), update: (...a: unknown[]) => mockSubUpdate(...a) },
    invoices: { createPreview: (...a: unknown[]) => mockInvoicePreview(...a) },
  },
}));

const params = Promise.resolve({ communitySlug: 'salsa' });
const community = { id: 'c1', stripe_account_id: 'acct_1', yearly_enabled: true, yearly_price: 200, stripe_yearly_price_id: 'price_year' };
const member = { stripe_subscription_id: 'sub_1' };
const subWithMonthlyItem = { items: { data: [{ id: 'si_1', price: { recurring: { interval: 'month' } } }] } };

beforeEach(() => {
  [mockGetSession, mockQueryOne, mockSubRetrieve, mockSubUpdate, mockInvoicePreview].forEach((m) => m.mockReset());
});

it('GET previews the prorated amount', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'u1' } });
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(member);
  mockSubRetrieve.mockResolvedValueOnce(subWithMonthlyItem);
  mockInvoicePreview.mockResolvedValueOnce({ amount_due: 18000, currency: 'eur' });

  const res = await GET(new Request('http://x'), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ prorationAmount: 18000, currency: 'eur', yearlyAmount: 20000 });
  expect(mockInvoicePreview).toHaveBeenCalledWith(
    expect.objectContaining({
      subscription: 'sub_1',
      subscription_details: expect.objectContaining({ items: [{ id: 'si_1', price: 'price_year' }] }),
    }),
    { stripeAccount: 'acct_1' },
  );
});

it('POST switches to yearly and reports success when the invoice is paid', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'u1' } });
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(member);
  mockSubRetrieve.mockResolvedValueOnce(subWithMonthlyItem);
  mockSubUpdate.mockResolvedValueOnce({ id: 'sub_1', latest_invoice: { status: 'paid' } });

  const res = await POST(new Request('http://x', { method: 'POST' }), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'succeeded' });
  expect(mockSubUpdate).toHaveBeenCalledWith(
    'sub_1',
    expect.objectContaining({
      items: [{ id: 'si_1', price: 'price_year' }],
      payment_behavior: 'pending_if_incomplete',
      proration_behavior: 'always_invoice',
    }),
    { stripeAccount: 'acct_1' },
  );
});

it('POST returns requiresAction with a client secret when 3DS is needed', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'u1' } });
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(member);
  mockSubRetrieve.mockResolvedValueOnce(subWithMonthlyItem);
  mockSubUpdate.mockResolvedValueOnce({ id: 'sub_1', latest_invoice: { status: 'open', confirmation_secret: { client_secret: 'pi_secret' } } });

  const res = await POST(new Request('http://x', { method: 'POST' }), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ requiresAction: true, clientSecret: 'pi_secret' });
  expect(mockSubUpdate).toHaveBeenCalledWith(
    'sub_1',
    expect.objectContaining({ payment_behavior: 'pending_if_incomplete', proration_behavior: 'always_invoice' }),
    { stripeAccount: 'acct_1' },
  );
});

it('POST returns 401 without a session', async () => {
  mockGetSession.mockResolvedValueOnce(null);
  const res = await POST(new Request('http://x', { method: 'POST' }), { params });
  expect(res.status).toBe(401);
});

it('POST returns 400 when the subscription is already yearly', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'u1' } });
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(member);
  mockSubRetrieve.mockResolvedValueOnce({ items: { data: [{ id: 'si_1', price: { recurring: { interval: 'year' } } }] } });

  const res = await POST(new Request('http://x', { method: 'POST' }), { params });
  expect(res.status).toBe(400);
  expect(mockSubUpdate).not.toHaveBeenCalled();
});

it('POST returns 404 when the member has no subscription', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'u1' } });
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(null);

  const res = await POST(new Request('http://x', { method: 'POST' }), { params });
  expect(res.status).toBe(404);
  expect(mockSubUpdate).not.toHaveBeenCalled();
});

it('POST returns 400 when the community does not have yearly enabled', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'u1' } });
  mockQueryOne.mockResolvedValueOnce({ ...community, yearly_enabled: false });

  const res = await POST(new Request('http://x', { method: 'POST' }), { params });
  expect(res.status).toBe(400);
  expect(mockSubUpdate).not.toHaveBeenCalled();
});
