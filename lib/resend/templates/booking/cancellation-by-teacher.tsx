import React from 'react';
import { Heading, Text, Section } from '@react-email/components';
import { BaseLayout } from '../base-layout';
import { EMAIL_STYLES, EMAIL_COLORS } from '../index';

interface Props {
  studentName: string;
  communityName: string;
  lessonTitle: string;
  lessonDate: string;
  refundedAmount: number;
  currency: string;
}

export const CancellationByTeacherEmail: React.FC<Props> = ({
  studentName,
  communityName,
  lessonTitle,
  lessonDate,
  refundedAmount,
  currency,
}) => {
  const preview = `Your lesson ${lessonTitle} was canceled`;
  return (
    <BaseLayout preview={preview}>
      <Heading style={EMAIL_STYLES.heading}>Your lesson was canceled</Heading>
      <Text style={EMAIL_STYLES.paragraph}>Hi {studentName},</Text>
      <Text style={EMAIL_STYLES.paragraph}>
        {communityName} canceled your <strong>{lessonTitle}</strong> scheduled for {lessonDate}.
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
        Feel free to book another lesson with the teacher whenever you're ready.
      </Text>
    </BaseLayout>
  );
};

export default CancellationByTeacherEmail;
