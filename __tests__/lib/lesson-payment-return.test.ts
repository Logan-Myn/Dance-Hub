import { lessonPaymentReturnNotice } from '@/lib/lesson-payment-return';

describe('lessonPaymentReturnNotice', () => {
  it('ignores a page load that is not a payment return', () => {
    expect(lessonPaymentReturnNotice('')).toBeNull();
    expect(lessonPaymentReturnNotice('?redirect_status=succeeded')).toBeNull();
  });

  it('confirms a succeeded payment', () => {
    expect(lessonPaymentReturnNotice('?lesson_payment=return&payment_intent=pi_1&redirect_status=succeeded'))
      .toEqual({ kind: 'success', message: expect.stringMatching(/confirmation email/i) });
  });

  it('reports a processing payment as pending', () => {
    expect(lessonPaymentReturnNotice('?lesson_payment=return&redirect_status=processing'))
      .toEqual({ kind: 'info', message: expect.stringMatching(/processing/i) });
  });

  it('reports a failed payment', () => {
    expect(lessonPaymentReturnNotice('?lesson_payment=return&redirect_status=failed'))
      .toEqual({ kind: 'error', message: expect.stringMatching(/not completed/i) });
  });
});
