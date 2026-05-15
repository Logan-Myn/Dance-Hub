import React from 'react';
import { Button, Heading, Text, Section, Hr } from '@react-email/components';
import { BaseLayout } from '../base-layout';
import { EMAIL_STYLES, EMAIL_COLORS } from '../index';

interface TeacherBookingNotificationEmailProps {
  teacherName: string;
  studentName: string;
  lessonTitle: string;
  lessonDate: string;
  lessonTime: string;
  duration: number;
  videoRoomUrl?: string;
  bookingId: string;
}

export const TeacherBookingNotificationEmail: React.FC<TeacherBookingNotificationEmailProps> = ({
  teacherName,
  studentName,
  lessonTitle,
  lessonDate,
  lessonTime,
  duration,
  videoRoomUrl,
  bookingId,
}) => {
  const preview = `${studentName} booked ${lessonTitle}`;

  return (
    <BaseLayout preview={preview}>
      <Heading style={EMAIL_STYLES.heading}>
        New Booking
      </Heading>

      <Text style={EMAIL_STYLES.paragraph}>
        Hi {teacherName},
      </Text>

      <Text style={EMAIL_STYLES.paragraph}>
        {studentName} just booked your private lesson. Here are the details:
      </Text>

      <Section style={{
        backgroundColor: EMAIL_COLORS.background,
        borderRadius: '8px',
        padding: '20px',
        margin: '24px 0',
      }}>
        <Text style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: EMAIL_COLORS.primary }}>
          {lessonTitle}
        </Text>

        <div style={{ marginBottom: '12px' }}>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
            <strong>Student:</strong> {studentName}
          </Text>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
            <strong>Date:</strong> {lessonDate}
          </Text>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
            <strong>Time:</strong> {lessonTime}
          </Text>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
            <strong>Duration:</strong> {duration} minutes
          </Text>
        </div>

        <Hr style={{ margin: '16px 0', border: 'none', borderTop: `1px solid ${EMAIL_COLORS.border}` }} />

        <div>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
            <strong>Booking ID:</strong> {bookingId}
          </Text>
        </div>
      </Section>

      <Text style={EMAIL_STYLES.paragraph}>
        <strong>How to join the lesson:</strong>
      </Text>

      <Text style={EMAIL_STYLES.paragraph}>
        When it's time for the lesson, you can join the video session directly from your dashboard or by clicking the button below:
      </Text>

      {videoRoomUrl && (
        <div style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button
            href={videoRoomUrl}
            style={{
              ...EMAIL_STYLES.button,
              display: 'inline-block',
            }}
          >
            Join Video Session
          </Button>
        </div>
      )}

      <Section style={{
        backgroundColor: '#fef3c7',
        borderLeft: `4px solid ${EMAIL_COLORS.warning}`,
        padding: '16px',
        margin: '24px 0',
      }}>
        <Text style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
          Quick checklist:
        </Text>
        <Text style={{ fontSize: '14px', margin: '4px 0' }}>
          • Test your camera and microphone before the lesson
        </Text>
        <Text style={{ fontSize: '14px', margin: '4px 0' }}>
          • Find a space with good lighting and enough room to move
        </Text>
        <Text style={{ fontSize: '14px', margin: '4px 0' }}>
          • Join the session 2-3 minutes early so your student isn't waiting
        </Text>
        <Text style={{ fontSize: '14px', margin: '4px 0' }}>
          • A reminder will go out 15 minutes before the lesson starts
        </Text>
      </Section>

      <Text style={{ ...EMAIL_STYLES.paragraph, fontSize: '14px', color: EMAIL_COLORS.textLight }}>
        Need to reschedule or cancel? Please contact your student at least 24 hours in advance through your dashboard.
      </Text>

      <Text style={{ ...EMAIL_STYLES.paragraph, fontSize: '14px', fontWeight: '600', marginTop: '24px' }}>
        Have a great lesson!<br />
        Dance-Hub
      </Text>
    </BaseLayout>
  );
};
