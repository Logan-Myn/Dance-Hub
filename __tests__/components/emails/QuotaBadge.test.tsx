import { render, screen } from '@testing-library/react';
import { QuotaBadge } from '@/components/emails/QuotaBadge';

describe('QuotaBadge', () => {
  it('shows VIP pill when tier is vip', () => {
    render(<QuotaBadge tier="vip" used={5} limit={null} />);
    expect(screen.getByText(/VIP/)).toBeInTheDocument();
  });

  it('shows used/limit when tier is free', () => {
    render(<QuotaBadge tier="free" used={3} limit={10} />);
    expect(screen.getByText(/3 \/ 10/)).toBeInTheDocument();
  });

  it('uses amber style when free tier is at limit', () => {
    const { container } = render(<QuotaBadge tier="free" used={10} limit={10} />);
    expect(container.firstChild).toHaveClass('bg-amber-100');
  });
});
