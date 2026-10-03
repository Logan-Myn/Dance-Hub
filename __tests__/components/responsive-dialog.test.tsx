import { render, screen } from '@testing-library/react';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';

jest.mock('@/hooks/use-is-mobile', () => ({
  useIsMobile: jest.fn(),
}));
import { useIsMobile } from '@/hooks/use-is-mobile';

describe('ResponsiveDialog', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders a centered Dialog when desktop', () => {
    (useIsMobile as jest.Mock).mockReturnValue(false);
    render(
      <ResponsiveDialog open>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Desktop modal</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    );
    const dialog = screen.getByRole('dialog');
    expect(screen.getByText('Desktop modal')).toBeInTheDocument();
    // The Dialog is centered inside its scrolling overlay.
    expect(dialog.parentElement).toHaveClass('place-items-center', 'overflow-y-auto');
    // And does NOT carry the Sheet bottom-0 anchor class.
    expect(dialog.className).not.toMatch(/bottom-0/);
  });

  it('renders a bottom Sheet when mobile', () => {
    (useIsMobile as jest.Mock).mockReturnValue(true);
    render(
      <ResponsiveDialog open>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Mobile sheet</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    );
    const dialog = screen.getByRole('dialog');
    expect(screen.getByText('Mobile sheet')).toBeInTheDocument();
    // Shadcn Sheet side=bottom anchors with inset-x-0 + bottom-0.
    expect(dialog.className).toMatch(/bottom-0/);
    expect(dialog.className).not.toMatch(/top-\[50%\]/);
  });
});
