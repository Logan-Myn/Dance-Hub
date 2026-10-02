// A private-lesson payment that needed a redirect (e.g. a bank's card check)
// comes back to the community's private lessons page with
// ?lesson_payment=return plus the redirect_status the payment form appends.
// The booking itself is created by the payment webhook, which also emails the
// confirmation.

export interface LessonPaymentReturnNotice {
  kind: 'success' | 'info' | 'error';
  message: string;
}

export function lessonPaymentReturnNotice(search: string): LessonPaymentReturnNotice | null {
  const params = new URLSearchParams(search);
  if (params.get('lesson_payment') !== 'return') return null;

  switch (params.get('redirect_status')) {
    case 'succeeded':
      return {
        kind: 'success',
        message: 'Payment received. Your confirmation will be emailed.',
      };
    case 'processing':
      return {
        kind: 'info',
        message: "Your payment is processing. We'll email you as soon as your booking is confirmed.",
      };
    default:
      return {
        kind: 'error',
        message: 'Payment was not completed. You have not been charged, please try again.',
      };
  }
}
