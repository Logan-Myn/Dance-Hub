import { getJoinButtonLabel } from '@/lib/page-builder';

describe('getJoinButtonLabel', () => {
  it('shows the monthly price when only monthly is configured', () => {
    expect(getJoinButtonLabel({ membershipEnabled: true, membershipPrice: 20 }))
      .toBe('Join for €20/month');
  });

  it('shows a generic label when a yearly plan is enabled', () => {
    expect(getJoinButtonLabel({
      membershipEnabled: true, membershipPrice: 20,
      yearlyEnabled: true, yearlyPrice: 200,
    })).toBe('Join community');
  });

  it('ignores yearly when its price is 0 or missing', () => {
    expect(getJoinButtonLabel({
      membershipEnabled: true, membershipPrice: 20, yearlyEnabled: true, yearlyPrice: 0,
    })).toBe('Join for €20/month');
  });

  it('shows free join when membership is not paid', () => {
    expect(getJoinButtonLabel({ membershipEnabled: false })).toBe('Join for free');
  });

  it('keeps the monthly framing for pre-registration even with yearly enabled', () => {
    expect(getJoinButtonLabel({
      status: 'pre_registration', membershipEnabled: true, membershipPrice: 20,
      yearlyEnabled: true, yearlyPrice: 200,
    })).toBe('Pre-Register for €20/month');
  });

  it('returns the member label when already a member (not editing)', () => {
    expect(getJoinButtonLabel({ isMember: true }, { isEditing: false }))
      .toBe("You're already a member");
  });
});
