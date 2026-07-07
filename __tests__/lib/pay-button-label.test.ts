import { payButtonDisplay } from '@/lib/pay-button-label';

describe('payButtonDisplay', () => {
  it('shows the recurring price and no caption when no discount is applied', () => {
    expect(payButtonDisplay({ mode: 'payment', dueTodayCents: null, price: 200, plan: 'yearly' }))
      .toEqual({ label: 'Pay €200/year', caption: null });
    expect(payButtonDisplay({ mode: 'payment', dueTodayCents: null, price: 20, plan: 'monthly' }))
      .toEqual({ label: 'Pay €20/month', caption: null });
  });

  it('shows the amount due today plus a recurring caption when a promo reduced the charge', () => {
    expect(payButtonDisplay({ mode: 'payment', dueTodayCents: 16000, price: 200, plan: 'yearly' }))
      .toEqual({ label: 'Pay €160 today', caption: 'then €200/year' });
  });

  it('keeps two decimals for non-round discounted amounts', () => {
    expect(payButtonDisplay({ mode: 'payment', dueTodayCents: 15920, price: 199, plan: 'yearly' }))
      .toEqual({ label: 'Pay €159.20 today', caption: 'then €199/year' });
  });

  it('falls back to the plain recurring label when the discounted amount equals the price', () => {
    expect(payButtonDisplay({ mode: 'payment', dueTodayCents: 20000, price: 200, plan: 'yearly' }))
      .toEqual({ label: 'Pay €200/year', caption: null });
  });

  it('shows the setup label with no caption regardless of amount', () => {
    expect(payButtonDisplay({ mode: 'setup', dueTodayCents: 0, price: 200, plan: 'yearly' }))
      .toEqual({ label: 'Save card and join', caption: null });
  });
});
