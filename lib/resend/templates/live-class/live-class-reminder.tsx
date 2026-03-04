import React from 'react';
import { Button, Heading, Text, Section } from '@react-email/components';
import { BaseLayout } from '../base-layout';
import { EMAIL_STYLES, EMAIL_COLORS } from '../index';

interface LiveClassReminderEmailProps {
  recipientName: string;
  className: string;
  teacherName: string;
  startTime: string;
  durationMinutes: number;
  calendarUrl: string;
}

export const LiveClassReminderEmail: React.FC<LiveClassReminderEmailProps> = ({
  recipientName,
  className,
  teacherName,
  startTime,
  durationMinutes,
  calendarUrl,
}) => {
  const preview = `Live class "${className}" starts in 30 minutes!`;

  return (
    <BaseLayout preview={preview}>
      <Section style={{
        backgroundColor: EMAIL_COLORS.warning,
        color: EMAIL_COLORS.white,
        padding: '16px',
        borderRadius: '8px',
        textAlign: 'center',
        marginBottom: '24px',
      }}>
        <Text style={{
          fontSize: '18px',
          fontWeight: '600',
          margin: 0,
          color: EMAIL_COLORS.white,
        }}>
          Your live class starts in 30 minutes!
        </Text>
      </Section>

      <Heading style={EMAIL_STYLES.heading}>
        Get Ready for Class
      </Heading>

      <Text style={EMAIL_STYLES.paragraph}>
        Hi {recipientName},
      </Text>

      <Text style={EMAIL_STYLES.paragraph}>
        Just a quick reminder that a live class is about to start. Don't miss it!
      </Text>

      <Section style={{
        backgroundColor: EMAIL_COLORS.background,
        borderRadius: '8px',
        padding: '20px',
        margin: '24px 0',
      }}>
        <Text style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: EMAIL_COLORS.primary }}>
          {className}
        </Text>

        <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
          Teacher: <strong>{teacherName}</strong>
        </Text>
        <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
          Starts at: <strong>{startTime}</strong>
        </Text>
        <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
          Duration: <strong>{durationMinutes} minutes</strong>
        </Text>
      </Section>

      <div style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button
          href={calendarUrl}
          style={{
            ...EMAIL_STYLES.button,
            backgroundColor: EMAIL_COLORS.primary,
            fontSize: '18px',
            padding: '16px 32px',
            display: 'inline-block',
          }}
        >
          View Class Details
        </Button>
      </div>

      <Text style={{ ...EMAIL_STYLES.paragraph, fontSize: '14px', color: EMAIL_COLORS.textLight }}>
        Make sure your camera, microphone, and internet connection are ready before the class begins.
      </Text>

      <Text style={{ ...EMAIL_STYLES.paragraph, fontSize: '14px', fontWeight: '600', marginTop: '24px' }}>
        See you in class!<br />
        DanceHub
      </Text>
    </BaseLayout>
  );
};
