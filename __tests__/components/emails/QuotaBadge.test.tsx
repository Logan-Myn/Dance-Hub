import { render, screen } from '@testing-library/react';
import { QuotaBadge } from '@/components/emails/QuotaBadge';

describe('QuotaBadge', () => {
  it('shows VIP access when tier is vip', () => {
    render(<QuotaBadge tier="vip" used={5} limit={null} />);
    expect(screen.getByText(/VIP access/)).toBeInTheDocument();
  });

  it('shows Unlimited + usage count when tier is paid', () => {
    render(<QuotaBadge tier="paid" used={37} limit={200} />);
    expect(screen.getByText(/Unlimited/)).toBeInTheDocument();
    expect(screen.getByText(/37 sent this month/)).toBeInTheDocument();
  });

  it('shows used/limit as narrative text when tier is free', () => {
    render(<QuotaBadge tier="free" used={3} limit={10} />);
    expect(screen.getByText(/3 of 10/)).toBeInTheDocument();
    expect(screen.getByText(/broadcasts this month/)).toBeInTheDocument();
  });

  it('renders an amber indicator dot when free tier is at limit', () => {
    const { container } = render(<QuotaBadge tier="free" used={10} limit={10} />);
    expect(container.querySelector('.bg-amber-500')).not.toBeNull();
  });

  it('renders a neutral indicator dot when free tier is below limit', () => {
    const { container } = render(<QuotaBadge tier="free" used={3} limit={10} />);
    expect(container.querySelector('.bg-slate-400')).not.toBeNull();
  });
});
