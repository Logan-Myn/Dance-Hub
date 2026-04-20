import { render, screen, fireEvent } from '@testing-library/react';
import MobileNav from '@/components/MobileNav';

jest.mock('next/navigation', () => ({
  usePathname: () => '/bachataflow',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const baseProps = {
  communitySlug: 'bachataflow',
  communityName: 'BachataFlow',
  communityImageUrl: null,
  isMember: true,
  isOwner: false,
  user: { id: 'u1', email: 'u@example.com' },
  profile: { full_name: 'User One', avatar_url: null },
};

describe('MobileNav', () => {
  it('renders top header with community name', () => {
    render(<MobileNav {...baseProps} />);
    expect(screen.getByText('BachataFlow')).toBeInTheDocument();
  });

  it('renders 5 primary tabs', () => {
    render(<MobileNav {...baseProps} />);
    expect(screen.getByRole('link', { name: /community/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /classroom/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /lessons/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /calendar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /more/i })).toBeInTheDocument();
  });

  it('hides Classroom and Calendar tabs for non-members', () => {
    render(<MobileNav {...baseProps} isMember={false} />);
    expect(screen.queryByRole('link', { name: /classroom/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /calendar/i })).not.toBeInTheDocument();
  });

  it('opens the More sheet on tap', () => {
    render(<MobileNav {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.getByText(/about/i)).toBeInTheDocument();
    expect(screen.getByText(/sign out/i)).toBeInTheDocument();
  });

  it('hides Admin in More sheet for non-owners', () => {
    const originalEnv = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED;
    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = 'true';

    render(<MobileNav {...baseProps} isOwner={false} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.queryByText(/^admin$/i)).not.toBeInTheDocument();

    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = originalEnv;
  });

  it('shows Admin in More sheet for owners when broadcasts are enabled', () => {
    const originalEnv = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED;
    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = 'true';

    render(<MobileNav {...baseProps} isOwner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.getByText(/^admin$/i)).toBeInTheDocument();

    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = originalEnv;
  });

  it('hides Admin even for owners when broadcasts are disabled', () => {
    const originalEnv = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED;
    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = 'false';

    render(<MobileNav {...baseProps} isOwner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.queryByText(/^admin$/i)).not.toBeInTheDocument();

    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = originalEnv;
  });

  it('marks the active tab by pathname', () => {
    render(<MobileNav {...baseProps} />);
    const community = screen.getByRole('link', { name: /community/i });
    expect(community.getAttribute('aria-current')).toBe('page');
  });
});
