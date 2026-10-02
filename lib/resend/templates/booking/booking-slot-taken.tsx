import React from 'react';
import { Heading, Text, Section } from '@react-email/components';
import { BaseLayout } from '../base-layout';
import { EMAIL_STYLES, EMAIL_COLORS } from '../index';

interface Props {
  studentName: string;
  lessonTitle: string;
  lessonDate: string;
  refundedAmount: number;
  currency: string;
}

// Sent when two payments for the same time slot raced: the one recorded
// second is refunded and no booking is created for it.
export const BookingSlotTakenEmail: React.FC<Props> = ({
  studentName,
  lessonTitle,
  lessonDate,
  refundedAmount,
  currency,
}) => {
  const preview = `Your ${lessonTitle} booking could not be completed`;
  return (
    <BaseLayout preview={preview}>
      <Heading style={EMAIL_STYLES.heading}>That time was just booked</Heading>
      <Text style={EMAIL_STYLES.paragraph}>Hi {studentName},</Text>
      <Text style={EMAIL_STYLES.paragraph}>
        The time you picked for <strong>{lessonTitle}</strong> ({lessonDate}) was booked a
        moment before your payment went through, so this payment could not reserve it.
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

export default BookingSlotTakenEmail;
