import { render, screen } from '@testing-library/react';
import { PromoCodesManager } from '@/components/admin/PromoCodesManager';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true, json: async () => ({ codes: [] }),
  }) as unknown as typeof fetch;
});

it('shows the plan scope selector when yearly is enabled', async () => {
  render(<PromoCodesManager communitySlug="salsa" yearlyEnabled />);
  expect(await screen.findByText(/which plan can use this code/i)).toBeInTheDocument();
});

it('hides the plan scope selector when yearly is disabled', async () => {
  render(<PromoCodesManager communitySlug="salsa" yearlyEnabled={false} />);
  expect(await screen.findByText(/your codes/i)).toBeInTheDocument();
  expect(screen.queryByText(/which plan can use this code/i)).not.toBeInTheDocument();
});
