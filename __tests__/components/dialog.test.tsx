import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

function renderDialog(onOpenChange = jest.fn()) {
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Book a lesson</DialogTitle>
        <button type="submit">Pay</button>
      </DialogContent>
    </Dialog>
  );
  const dialog = screen.getByRole('dialog');
  return { dialog, overlay: dialog.parentElement as HTMLElement, onOpenChange };
}

// jsdom has no PointerEvent, so fireEvent.pointerDown would drop clientX.
beforeAll(() => {
  class PointerEventStub extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventStub;
});
afterAll(() => {
  delete (window as unknown as { PointerEvent?: unknown }).PointerEvent;
});

// Radix starts listening for outside presses on the next tick.
const nextTick = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe('DialogContent', () => {
  it('sits in a full-screen overlay that scrolls, so a dialog taller than the screen can be scrolled from anywhere', () => {
    const { dialog, overlay } = renderDialog();

    expect(overlay).not.toBe(document.body);
    expect(overlay).toHaveClass('fixed', 'inset-0', 'overflow-y-auto');
    // Not pinned to the middle of the viewport, where its ends would be cut off.
    expect(dialog).not.toHaveClass('fixed');
    expect(dialog.className).not.toMatch(/translate-y-\[-50%\]/);
  });

  it('stays open when the overlay scrollbar is pressed, and closes on a backdrop click', async () => {
    const { overlay, onOpenChange } = renderDialog();
    await nextTick();
    // 1000px of overlay content area, then the scrollbar.
    Object.defineProperty(overlay, 'clientWidth', { configurable: true, value: 1000 });

    fireEvent.pointerDown(overlay, { clientX: 1004, clientY: 300, button: 0 });
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(overlay, { clientX: 40, clientY: 300, button: 0 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
