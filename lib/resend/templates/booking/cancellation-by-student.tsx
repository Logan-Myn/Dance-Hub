import React from 'react';
import { Heading, Text, Section } from '@react-email/components';
import { BaseLayout } from '../base-layout';
import { EMAIL_STYLES, EMAIL_COLORS } from '../index';

interface Props {
  teacherName: string;
  studentName: string;
  lessonTitle: string;
  lessonDate: string;
  refundedAmount: number;
  currency: string;
  wasRefunded: boolean;
}

export const CancellationByStudentEmail: React.FC<Props> = ({
  teacherName,
  studentName,
  lessonTitle,
  lessonDate,
  refundedAmount,
  currency,
  wasRefunded,
}) => {
  const preview = `${studentName} canceled their booking for ${lessonTitle}`;
  return (
    <BaseLayout preview={preview}>
      <Heading style={EMAIL_STYLES.heading}>Booking canceled</Heading>
      <Text style={EMAIL_STYLES.paragraph}>Hi {teacherName},</Text>
      <Text style={EMAIL_STYLES.paragraph}>
        {studentName} canceled their booking for <strong>{lessonTitle}</strong> on {lessonDate}.
      </Text>
      <Section style={{
        backgroundColor: EMAIL_COLORS.background,
        borderRadius: '8px',
        padding: '20px',
        margin: '16px 0',
      }}>
        <Text style={EMAIL_STYLES.paragraph}>
          {wasRefunded
            ? `They were refunded ${currency.toUpperCase()} ${refundedAmount.toFixed(2)}.`
            : 'Per your cancellation policy, no refund was issued.'}
        </Text>
        <Text style={EMAIL_STYLES.paragraph}>
          The slot is now available again.
        </Text>
      </Section>
    </BaseLayout>
  );
};

export default CancellationByStudentEmail;
