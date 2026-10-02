import React from 'react';
import { Heading, Text, Section } from '@react-email/components';
import { BaseLayout } from '../base-layout';
import { EMAIL_STYLES, EMAIL_COLORS } from '../index';

/**
 * Why a paid lesson was not booked:
 * - slot_taken: another payment for the same time was recorded first.
 * - unavailable: the time or the lesson was removed, or the time passed.
 * - monthly_limit: the lesson's monthly booking limit filled up.
 */
export type BookingNotCompletedReason = 'slot_taken' | 'unavailable' | 'monthly_limit';

interface Props {
  reason: BookingNotCompletedReason;
  studentName: string;
  lessonTitle: string;
  lessonDate: string;
  refundedAmount: number;
  currency: string;
}

// Sent when a lesson payment went through but the booking could not be
// created; the payment is refunded in full.
export const BookingNotCompletedEmail: React.FC<Props> = ({
  reason,
  studentName,
  lessonTitle,
  lessonDate,
  refundedAmount,
  currency,
}) => {
  const preview = `Your ${lessonTitle} booking could not be completed`;
  const heading =
    reason === 'slot_taken'
      ? 'That time was just booked'
      : reason === 'monthly_limit'
        ? 'This lesson is fully booked that month'
        : 'That time is no longer available';
  const explanation =
    reason === 'slot_taken'
      ? 'was booked a moment before your payment went through'
      : reason === 'monthly_limit'
        ? "falls in a month the teacher's bookings for this lesson have filled up"
        : 'is no longer available';
  return (
    <BaseLayout preview={preview}>
      <Heading style={EMAIL_STYLES.heading}>{heading}</Heading>
      <Text style={EMAIL_STYLES.paragraph}>Hi {studentName},</Text>
      <Text style={EMAIL_STYLES.paragraph}>
        The time you picked for <strong>{lessonTitle}</strong> ({lessonDate}) {explanation}, so
        this payment could not book it.
      </Text>
      <Section style={{
        backgroundColor: EMAIL_COLORS.background,
        borderRadius: '8px',
        padding: '20px',
        margin: '16px 0',
      }}>
        <Text style={EMAIL_STYLES.paragraph}>
          <strong>{currency.toUpperCase()} {refundedAmount.toFixed(2)}</strong> has been refunded to your card. Refunds typically take 5–10 days to appear.
        </Text>
      </Section>
      <Text style={EMAIL_STYLES.paragraph}>
        Please pick another time with the teacher whenever you&apos;re ready.
      </Text>
    </BaseLayout>
  );
};

export default BookingNotCompletedEmail;
