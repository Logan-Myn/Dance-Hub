import { POST } from '@/app/api/webhooks/stripe/route';
import { claimWebhookEvent, finishWebhookEvent } from '@/lib/stripe-webhook-events';
import { recordBroadcastSubscription } from '@/lib/broadcasts/billing';

// The event under test is whatever constructEvent returns; signatures aren't checked here.
const mockConstructEvent = jest.fn();
const mockSubRetrieve = jest.fn();
const mockSubUpdate = jest.fn();
const mockStripeClient = {
  webhooks: { constructEvent: (...a: unknown[]) => mockConstructEvent(...a) },
  subscriptions: {
    retrieve: (...a: unknown[]) => mockSubRetrieve(...a),
    update: (...a: unknown[]) => mockSubUpdate(...a),
  },
};
jest.mock('@/lib/stripe', () => ({
  STRIPE_API_VERSION: '2025-12-15.clover',
  get stripe() { return mockStripeClient; },
}));
// Connected-account events build their own client; route it to the same mocks.
jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => mockStripeClient) }));
jest.mock('next/headers', () => ({
  headers: async () => new Headers({ 'stripe-signature': 'sig' }),
}));

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: Object.assign((...a: unknown[]) => mockSql(...a), { json: (v: unknown) => v }),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: jest.fn(),
}));

jest.mock('@/lib/stripe-webhook-events', () => ({
  claimWebhookEvent: jest.fn(),
  finishWebhookEvent: jest.fn(),
}));
const mockClaim = claimWebhookEvent as jest.Mock;
const mockFinish = finishWebhookEvent as jest.Mock;

const mockSendEmail = jest.fn();
jest.mock('@/lib/resend/email-service', () => ({
  getEmailService: () => ({ sendNotificationEmail: (...a: unknown[]) => mockSendEmail(...a) }),
}));
jest.mock('@/lib/resend/templates/community/member-welcome', () => ({ MemberWelcomeEmail: () => null }));
jest.mock('@/lib/resend/templates/community/community-opening', () => ({ CommunityOpeningEmail: () => null }));
jest.mock('@/lib/resend/templates/booking/booking-confirmation', () => ({ BookingConfirmationEmail: () => null }));
jest.mock('@/lib/resend/templates/booking/teacher-booking-notification', () => ({ TeacherBookingNotificationEmail: () => null }));
jest.mock('@/lib/resend/templates/booking/payment-receipt', () => ({ PaymentReceiptEmail: () => null }));
jest.mock('@/lib/broadcasts/billing', () => ({
  recordBroadcastSubscription: jest.fn().mockResolvedValue('recorded'),
}));

type SqlCall = { text: string; strings: string[]; values: unknown[] };
const sqlCalls = (): SqlCall[] =>
  mockSql.mock.calls.map(([strings, ...values]) => ({
    text: (strings as string[]).join('?'),
    strings: strings as string[],
    values,
  }));
/** The value interpolated right after the SQL fragment matching `re`. */
function valueAfter(call: SqlCall, re: RegExp): unknown {
  const i = call.strings.findIndex((s) => re.test(s));
  if (i < 0) throw new Error(`fragment ${re} not found in: ${call.text}`);
  return call.values[i];
}
const memberUpdates = () => sqlCalls().filter((c) => /UPDATE community_members/.test(c.text));

const community = {
  id: 'c1', name: 'Salsa', slug: 'salsa', description: null, image_url: null,
  membership_price: 20, created_at: '2020-01-01T00:00:00.000Z', active_member_count: 10,
  status: 'active', opening_date: null,
};

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    cancel_at_period_end: false,
    application_fee_percent: 8,
    metadata: { user_id: 'u1', community_id: 'c1' },
    items: { data: [{ current_period_end: 4102444800 }] },
    ...overrides,
  };
}

function invoiceEvent(invoice: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    type: 'invoice.payment_succeeded',
    account: 'acct_1',
    created: 1,
    data: {
      object: {
        id: 'in_1',
        billing_reason: 'subscription_create',
        customer_email: 'payer@example.com',
        customer_name: 'Pat Payer',
        parent: { subscription_details: { subscription: 'sub_1' } },
        ...invoice,
      },
    },
  };
}

function subscriptionEvent(type: string, sub: Record<string, unknown>) {
  return { id: 'evt_2', type, account: 'acct_1', created: 1, data: { object: sub } };
}

/** member row status before -> after, as the UPDATE ... RETURNING reports it. */
function memberRowTransition(previous: string, next: string) {
  mockSql.mockImplementation((strings: string[]) => {
    const text = strings.join('?');
    if (/WITH prev AS/.test(text)) return Promise.resolve([{ previous_status: previous, status: next }]);
    return Promise.resolve([]);
  });
}

function post() {
  return POST(new Request('http://x', { method: 'POST', body: '{}' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockClaim.mockResolvedValue('claimed');
  mockFinish.mockResolvedValue(undefined);
  mockSql.mockResolvedValue([]);
  // community, then the member's profile for the email
  mockQueryOne.mockImplementation((strings: string[]) => {
    const text = strings.join('?');
    if (/FROM communities/.test(text)) return Promise.resolve(community);
    if (/FROM profiles/.test(text)) return Promise.resolve({ full_name: 'Pat', email: 'payer@example.com' });
    return Promise.resolve(null);
  });
});

describe('invoice.payment_succeeded', () => {
  it('activates the member on the first payment, matched by subscription id, and welcomes them once', async () => {
    mockConstructEvent.mockReturnValue(invoiceEvent());
    mockSubRetrieve.mockResolvedValue(subscription());
    memberRowTransition('pending', 'active');

    const res = await post();

    expect(res.status).toBe(200);
    const [update] = memberUpdates();
    expect(update.text).toMatch(/stripe_subscription_id = \?/);
    expect(update.values).toContain('sub_1');
    expect(valueAfter(update, /status = COALESCE\($/)).toBe('active');
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith('payer@example.com', 'Welcome to Salsa!', expect.anything());
  });

  it.each([
    ['a renewal', 'subscription_cycle'],
    ['the switch-to-yearly proration', 'subscription_update'],
  ])('sends no email for %s', async (_label, billingReason) => {
    mockConstructEvent.mockReturnValue(invoiceEvent({ billing_reason: billingReason }));
    mockSubRetrieve.mockResolvedValue(subscription());
    memberRowTransition('active', 'active');

    const res = await post();

    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does not count members by hand (a trigger keeps members_count)', async () => {
    mockConstructEvent.mockReturnValue(invoiceEvent());
    mockSubRetrieve.mockResolvedValue(subscription());
    memberRowTransition('pending', 'active');

    await post();

    expect(sqlCalls().some((c) => /members_count/.test(c.text))).toBe(false);
  });

  it('does not re-activate a member when the subscription has since been canceled', async () => {
    mockConstructEvent.mockReturnValue(invoiceEvent({ billing_reason: 'subscription_cycle' }));
    mockSubRetrieve.mockResolvedValue(subscription({ status: 'canceled' }));
    memberRowTransition('inactive', 'inactive');

    const res = await post();

    expect(res.status).toBe(200);
    const [update] = memberUpdates();
    expect(valueAfter(update, /status = COALESCE\($/)).toBeNull();
    expect(valueAfter(update, /subscription_status = $/)).toBe('canceled');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('keeps a pre-registered member pre-registered while the community has not opened', async () => {
    mockQueryOne.mockImplementation((strings: string[]) => {
      const text = strings.join('?');
      if (/FROM communities/.test(text)) {
        return Promise.resolve({ ...community, status: 'pre_registration', opening_date: '2099-01-01T00:00:00.000Z' });
      }
      return Promise.resolve(null);
    });
    mockConstructEvent.mockReturnValue(invoiceEvent({ amount_paid: 0 }));
    mockSubRetrieve.mockResolvedValue(subscription({ metadata: { user_id: 'u1', community_id: 'c1', is_pre_registration: 'true' } }));
    memberRowTransition('pre_registered', 'pre_registered');

    await post();

    expect(valueAfter(memberUpdates()[0], /status = COALESCE\($/)).toBeNull();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('asks Stripe to retry when the join has not stored the subscription id on its row yet', async () => {
    // A 100%-off first invoice is paid as soon as the subscription exists,
    // possibly before join-paid writes the id onto the pending row.
    mockConstructEvent.mockReturnValue(invoiceEvent({ amount_paid: 0 }));
    mockSubRetrieve.mockResolvedValue(subscription());
    mockSql.mockImplementation((strings: string[]) => {
      const text = strings.join('?');
      if (/WITH prev AS/.test(text)) return Promise.resolve([]);
      if (/stripe_subscription_id IS NULL/.test(text)) return Promise.resolve([{ id: 'm_new' }]);
      return Promise.resolve([]);
    });

    const res = await post();

    expect(res.status).toBe(503);
    expect(mockFinish).toHaveBeenCalledWith('evt_1', false);
    const lookup = sqlCalls().find((c) => /stripe_subscription_id IS NULL/.test(c.text));
    expect(lookup?.text).toMatch(/status = 'pending'/);
    expect(lookup?.values).toEqual(expect.arrayContaining(['c1', 'u1']));
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('answers 200 when no row holds the subscription and no join is in progress', async () => {
    mockConstructEvent.mockReturnValue(invoiceEvent());
    mockSubRetrieve.mockResolvedValue(subscription());
    mockSql.mockResolvedValue([]);

    const res = await post();

    expect(res.status).toBe(200);
    expect(mockFinish).toHaveBeenCalledWith('evt_1', true);
  });

  it('logs the invoice by id only, never its customer details', async () => {
    mockConstructEvent.mockReturnValue(invoiceEvent());
    mockSubRetrieve.mockResolvedValue(subscription());
    memberRowTransition('active', 'active');

    await post();

    const logged = (console.log as jest.Mock).mock.calls.map((args) => JSON.stringify(args)).join('\n');
    expect(logged).toContain('in_1');
    expect(logged).not.toContain('Pat Payer');
    expect(logged).not.toContain('payer@example.com');
  });
});

describe('customer.subscription.updated / deleted', () => {
  it('only touches the row that holds this subscription', async () => {
    mockConstructEvent.mockReturnValue(
      subscriptionEvent('customer.subscription.deleted', subscription({ id: 'sub_old', status: 'canceled' })),
    );

    const res = await post();

    expect(res.status).toBe(200);
    const updates = memberUpdates();
    expect(updates).toHaveLength(2);
    for (const update of updates) {
      expect(update.text).toMatch(/stripe_subscription_id = \?/);
      expect(update.values).toContain('sub_old');
    }
    expect(sqlCalls().some((c) => /members_count/.test(c.text))).toBe(false);
  });

  it('marks a subscription set to end as canceling', async () => {
    mockConstructEvent.mockReturnValue(
      subscriptionEvent('customer.subscription.updated', subscription({ cancel_at_period_end: true })),
    );

    await post();

    const [update] = memberUpdates();
    expect(valueAfter(update, /subscription_status = $/)).toBe('canceling');
    expect(update.values).toContain('sub_1');
  });
});

describe('invoice.payment_failed', () => {
  it('only touches the row that holds this subscription', async () => {
    mockConstructEvent.mockReturnValue({
      ...invoiceEvent({ billing_reason: 'subscription_cycle' }),
      type: 'invoice.payment_failed',
    });
    mockSubRetrieve.mockResolvedValue(subscription({ status: 'past_due' }));

    await post();

    const [update] = memberUpdates();
    expect(update.text).toMatch(/stripe_subscription_id = \?/);
    expect(update.values).toEqual(expect.arrayContaining(['past_due', 'sub_1']));
  });
});

describe('event dedupe', () => {
  it('skips an event that was already processed', async () => {
    mockConstructEvent.mockReturnValue(invoiceEvent());
    mockClaim.mockResolvedValueOnce('duplicate');

    const res = await post();

    expect(res.status).toBe(200);
    expect(mockSubRetrieve).not.toHaveBeenCalled();
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
  });

  it('asks Stripe to retry an event another attempt is still processing', async () => {
    mockConstructEvent.mockReturnValue(invoiceEvent());
    mockClaim.mockResolvedValueOnce('in_progress');

    const res = await post();

    expect(res.status).toBe(409);
    expect(mockSubRetrieve).not.toHaveBeenCalled();
  });

  it('marks a handled event as processed', async () => {
    mockConstructEvent.mockReturnValue(invoiceEvent());
    mockSubRetrieve.mockResolvedValue(subscription());
    memberRowTransition('active', 'active');

    await post();

    expect(mockClaim).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt_1' }));
    expect(mockFinish).toHaveBeenCalledWith('evt_1', true);
  });

  it('releases the event when handling fails, so the retry runs it again', async () => {
    mockConstructEvent.mockReturnValue(invoiceEvent());
    mockSubRetrieve.mockRejectedValue(new Error('stripe down'));

    const res = await post();

    expect(res.status).toBe(500);
    expect(mockFinish).toHaveBeenCalledWith('evt_1', false);
  });
});

describe('private lesson payment_intent.succeeded', () => {
  const lessonEvent = {
    id: 'evt_3',
    type: 'payment_intent.succeeded',
    account: 'acct_1',
    created: 1,
    data: {
      object: {
        id: 'pi_1',
        metadata: {
          type: 'private_lesson', lesson_id: 'l1', community_id: 'c1', student_id: 'u1',
          student_email: 'student@example.com', price_paid: '40', scheduled_at: '2099-01-01T10:00:00.000Z',
        },
      },
    },
  };

  it('answers 200 without a second set of emails when the booking already exists', async () => {
    mockConstructEvent.mockReturnValue(lessonEvent);
    mockQueryOne.mockResolvedValue(null); // ON CONFLICT DO NOTHING returned no row

    const res = await post();

    expect(res.status).toBe(200);
    const insert = (mockQueryOne.mock.calls[0][0] as string[]).join('?');
    expect(insert).toMatch(/INSERT INTO lesson_bookings/);
    expect(insert).toMatch(/ON CONFLICT \(stripe_payment_intent_id\) DO NOTHING/);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe('broadcast subscription lifecycle', () => {
  const broadcastSub = subscription({
    id: 'sub_bc',
    status: 'canceled',
    customer: 'cus_platform',
    metadata: { purpose: 'broadcast_subscription', communityId: 'c1' },
  });

  it('skips with 200 when the community has been deleted', async () => {
    mockConstructEvent.mockReturnValue({ ...subscriptionEvent('customer.subscription.deleted', broadcastSub), account: undefined });
    mockQueryOne.mockResolvedValue(null); // community row is gone

    const res = await post();

    expect(res.status).toBe(200);
    expect(recordBroadcastSubscription).not.toHaveBeenCalled();
    expect(mockFinish).toHaveBeenCalledWith('evt_2', true);
  });

  it('still records the status while the community exists', async () => {
    mockConstructEvent.mockReturnValue({ ...subscriptionEvent('customer.subscription.updated', broadcastSub), account: undefined });

    const res = await post();

    expect(res.status).toBe(200);
    expect(recordBroadcastSubscription).toHaveBeenCalledWith('c1', broadcastSub);
    expect(memberUpdates()).toHaveLength(0);
  });

  it.each(['invoice.payment_succeeded', 'invoice.payment_failed'])(
    'answers 200 to %s for a broadcast subscription without touching members',
    async (type) => {
      mockConstructEvent.mockReturnValue({
        ...invoiceEvent({ parent: { subscription_details: { subscription: 'sub_bc' } } }),
        type,
        account: undefined,
      });
      mockSubRetrieve.mockResolvedValue(broadcastSub);

      const res = await post();

      expect(res.status).toBe(200);
      expect(memberUpdates()).toHaveLength(0);
      expect(mockSendEmail).not.toHaveBeenCalled();
    }
  );
});
