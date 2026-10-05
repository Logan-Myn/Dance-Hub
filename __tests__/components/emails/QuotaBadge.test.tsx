import { render, screen } from '@testing-library/react';
import { QuotaBadge } from '@/components/emails/QuotaBadge';

describe('QuotaBadge', () => {
  it('shows unlimited sending for VIP communities', () => {
    render(<QuotaBadge tier="vip" used={5} limit={null} />);
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
    expect(screen.getByText(/5 sent this month/)).toBeInTheDocument();
  });

  it('shows Unlimited + usage count when tier is paid', () => {
    render(<QuotaBadge tier="paid" used={37} limit={200} />);
    expect(screen.getByText(/Unlimited/)).toBeInTheDocument();
    expect(screen.getByText(/37 sent this month/)).toBeInTheDocument();
  });

  it('shows used of limit when tier is free', () => {
    render(<QuotaBadge tier="free" used={3} limit={10} />);
    expect(screen.getByText(/3 of 10/)).toBeInTheDocument();
    expect(screen.getByText(/emails this month/)).toBeInTheDocument();
  });

  it('warns when the free tier is used up', () => {
    render(<QuotaBadge tier="free" used={10} limit={10} />);
    expect(screen.getByText(/10 of 10/).className).toMatch(/text-warn/);
  });

  it('stays neutral below the free limit', () => {
    render(<QuotaBadge tier="free" used={3} limit={10} />);
    expect(screen.getByText(/3 of 10/).className).not.toMatch(/text-warn/);
  });
});
